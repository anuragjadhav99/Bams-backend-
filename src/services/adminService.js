/**
 * Admin Service.
 *
 * Business logic for platform administration:
 *   • Dashboard stats and analytics
 *   • User management (read, update status/role, soft-delete)
 *   • Notes & pages management (CRUD, reordering, S3 integration)
 *   • Order management (paginated filters, state updates, CSV export)
 *   • Subjects management
 *   • Charts & sessions analytics
 *
 * @module services/adminService
 */

const mongoose = require("mongoose");
const { User, Order, Note, Page, Subject, Subscription, Session } = require("../models");
const AppError = require("../utils/AppError");
const logger = require("../config/logger");
const { slugify } = require("../utils/slugify");
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { s3 } = require("../config/s3");
const { env } = require("../config/env");

/**
 * Get platform overview metrics for the admin dashboard.
 * Uses Promise.all to query all aggregations and counts concurrently.
 *
 * @returns {Promise<Object>} Object containing overview counts, current month info, revenue split, recent orders, and top notes
 */
async function getStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalUsers,
    totalOrders,
    totalRevenue,
    activeSubscriptions,
    totalNotes,
    totalSubjects,
    revenueThisMonth,
    newUsersThisMonth,
    newOrdersThisMonth,
    revenueByTypeRaw,
    recentOrders,
    topNotes
  ] = await Promise.all([
    User.countDocuments(),
    Order.countDocuments({ status: "paid" }),
    Order.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]).then((r) => r[0]?.total || 0),
    Subscription.countDocuments({
      status: "active",
      currentPeriodEnd: { $gt: now }
    }),
    Note.countDocuments(),
    Subject.countDocuments(),
    Order.aggregate([
      { $match: { status: "paid", createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]).then((r) => r[0]?.total || 0),
    User.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Order.countDocuments({ status: "paid", createdAt: { $gte: startOfMonth } }),
    Order.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: "$orderType", total: { $sum: "$amount" } } }
    ]),
    Order.find({ status: "paid" })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("user", "name")
      .populate("note", "title")
      .lean(),
    Order.aggregate([
      { $match: { status: "paid", note: { $ne: null } } },
      { $group: { _id: "$note", orderCount: { $sum: 1 } } },
      { $sort: { orderCount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "notes",
          localField: "_id",
          foreignField: "_id",
          as: "noteDetails"
        }
      },
      { $unwind: "$noteDetails" },
      {
        $lookup: {
          from: "subjects",
          localField: "noteDetails.subject",
          foreignField: "_id",
          as: "subjectDetails"
        }
      },
      { $unwind: { path: "$subjectDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          title: "$noteDetails.title",
          subject: "$subjectDetails.name",
          orderCount: 1
        }
      }
    ])
  ]);

  const revenueByType = {
    single_note: 0,
    year_package: 0,
    full_package: 0,
    subscription: 0
  };

  revenueByTypeRaw.forEach((item) => {
    if (revenueByType[item._id] !== undefined) {
      revenueByType[item._id] = item.total;
    }
  });

  return {
    overview: {
      totalUsers,
      totalOrders,
      totalRevenue,
      activeSubscriptions,
      totalNotes,
      totalSubjects
    },
    thisMonth: {
      revenue: revenueThisMonth,
      newUsers: newUsersThisMonth,
      newOrders: newOrdersThisMonth
    },
    revenueByType,
    recentOrders: recentOrders.map((o) => ({
      id: o._id,
      userName: o.user?.name || "N/A",
      noteTitle: o.note?.title || (o.orderType === "year_package" ? `${o.year} Package` : "Package/Subscription"),
      amount: o.amount,
      status: o.status,
      createdAt: o.createdAt
    })),
    topNotes
  };
}

/**
 * Get a paginated list of users with search, role, status filters, and order aggregates.
 *
 * @param {Object} params - Query and pagination parameters
 * @returns {Promise<{ users: Array, total: number, page: number, limit: number }>} User list payload
 */
async function getUsers({ page, limit, skip, search, role, accountStatus, sortBy = "createdAt", sortOrder = "desc" }) {
  const match = {};

  if (search) {
    match.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } }
    ];
  }

  if (role) {
    match.role = role;
  }

  if (accountStatus) {
    match.accountStatus = accountStatus;
  }

  const sortStage = {};
  sortStage[sortBy] = sortOrder === "asc" ? 1 : -1;

  const total = await User.countDocuments(match);

  const pipeline = [
    { $match: match },
    { $sort: sortStage },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: "orders",
        let: { userId: "$_id" },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ["$user", "$$userId"] }, { $eq: ["$status", "paid"] }] } } }
        ],
        as: "userOrders"
      }
    },
    {
      $addFields: {
        totalOrders: { $size: "$userOrders" },
        totalSpent: { $sum: "$userOrders.amount" }
      }
    },
    {
      $project: {
        id: "$_id",
        _id: 1,
        name: 1,
        email: 1,
        phone: 1,
        avatar: 1,
        role: 1,
        accountStatus: 1,
        authProvider: 1,
        createdAt: 1,
        totalOrders: 1,
        totalSpent: 1
      }
    }
  ];

  const users = await User.aggregate(pipeline);

  return { users, total, page, limit };
}

/**
 * Get detailed profile information for a single user including orders and sessions.
 *
 * @param {string} userId - User ID to query
 * @returns {Promise<Object>} Complete user details
 */
async function getUserById(userId) {
  const user = await User.findById(userId).lean();
  if (!user) {
    throw new AppError("User not found", 404);
  }

  const [ordersSummary, recentOrders, activeSubscription, activeSessions] = await Promise.all([
    Order.aggregate([
      { $match: { user: user._id, status: "paid" } },
      { $group: { _id: null, totalOrders: { $sum: 1 }, totalSpent: { $sum: "$amount" } } }
    ]),
    Order.find({ user: user._id, status: "paid" })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("note", "title")
      .lean(),
    Subscription.findOne({
      user: user._id,
      status: "active",
      currentPeriodEnd: { $gt: new Date() }
    }).lean(),
    Session.countDocuments({ user: user._id, isActive: true })
  ]);

  return {
    ...user,
    id: user._id,
    totalOrders: ordersSummary[0]?.totalOrders || 0,
    totalSpent: ordersSummary[0]?.totalSpent || 0,
    recentOrders: recentOrders.map((o) => ({
      id: o._id,
      orderType: o.orderType,
      amount: o.amount,
      status: o.status,
      noteTitle: o.note ? o.note.title : null,
      createdAt: o.createdAt
    })),
    activeSubscription,
    activeSessionsCount: activeSessions
  };
}

/**
 * Update user account status and invalidate sessions if needed.
 *
 * @param {string} userId - User ID
 * @param {string} accountStatus - New status
 * @returns {Promise<Object>} Updated user profile summary
 */
async function updateUserStatus(userId, accountStatus) {
  if (!ACCOUNT_STATUSES.includes(accountStatus)) {
    throw new AppError("Invalid account status. Must be one of: " + ACCOUNT_STATUSES.join(", "), 400);
  }

  const updates = { accountStatus };
  if (accountStatus === "deleted") {
    updates.deletedAt = new Date();
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true, runValidators: true }
  ).lean();

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (accountStatus === "suspended" || accountStatus === "deleted") {
    await Session.updateMany({ user: user._id, isActive: true }, { $set: { isActive: false, endedAt: new Date() } });
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus,
    createdAt: user.createdAt
  };
}

/**
 * Promote/demote a user's role on the platform.
 *
 * @param {string} userId - Target user ID
 * @param {string} role - Target role ('student' or 'admin')
 * @returns {Promise<Object>} Updated user profile info
 */
async function updateUserRole(userId, role) {
  if (role !== "student" && role !== "admin") {
    throw new AppError("Invalid role. Role must be 'student' or 'admin'", 400);
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { role } },
    { new: true, runValidators: true }
  ).lean();

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus
  };
}

/**
 * Soft delete a user, setting status to deleted and cleaning active sessions.
 *
 * @param {string} userId - User to delete
 * @returns {Promise<boolean>} Success confirmation
 */
async function deleteUser(userId) {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { accountStatus: "deleted", deletedAt: new Date() } },
    { new: true }
  );

  if (!user) {
    throw new AppError("User not found", 404);
  }

  await Session.updateMany({ user: user._id, isActive: true }, { $set: { isActive: false, endedAt: new Date() } });
  return true;
}

/**
 * Get paginated list of notes with aggregation fields for orders and revenue.
 *
 * @param {Object} params - Search and query options
 * @returns {Promise<{ notes: Array, total: number, page: number, limit: number }>} Note payload
 */
async function getNotes({ page, limit, skip, search, subjectId, year, publishStatus, sortBy = "createdAt", sortOrder = "desc" }) {
  const match = {};

  if (search) {
    match.title = { $regex: search, $options: "i" };
  }

  if (publishStatus) {
    match.publishStatus = publishStatus;
  }

  if (subjectId) {
    match.subject = new mongoose.Types.ObjectId(subjectId);
  }

  const pipeline = [];

  if (year) {
    pipeline.push(
      {
        $lookup: {
          from: "subjects",
          localField: "subject",
          foreignField: "_id",
          as: "subjectDetails"
        }
      },
      { $unwind: "$subjectDetails" },
      { $match: { "subjectDetails.year": year, ...match } }
    );
  } else {
    pipeline.push({ $match: match });
    pipeline.push(
      {
        $lookup: {
          from: "subjects",
          localField: "subject",
          foreignField: "_id",
          as: "subjectDetails"
        }
      },
      { $unwind: { path: "$subjectDetails", preserveNullAndEmptyArrays: true } }
    );
  }

  const countPipeline = [...pipeline, { $count: "total" }];
  const countResult = await Note.aggregate(countPipeline);
  const total = countResult[0]?.total || 0;

  const sortStage = {};
  sortStage[sortBy] = sortOrder === "asc" ? 1 : -1;
  pipeline.push({ $sort: sortStage }, { $skip: skip }, { $limit: limit });

  pipeline.push(
    {
      $lookup: {
        from: "orders",
        let: { noteId: "$_id" },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ["$note", "$$noteId"] }, { $eq: ["$status", "paid"] }] } } }
        ],
        as: "noteOrders"
      }
    },
    {
      $addFields: {
        orderCount: { $size: "$noteOrders" },
        revenue: { $sum: "$noteOrders.amount" }
      }
    },
    {
      $project: {
        id: "$_id",
        _id: 1,
        title: 1,
        slug: 1,
        subject: "$subjectDetails",
        totalPages: 1,
        samplePages: 1,
        price: 1,
        mrp: 1,
        publishStatus: 1,
        createdAt: 1,
        orderCount: 1,
        revenue: 1
      }
    }
  );

  const notes = await Note.aggregate(pipeline);

  return { notes, total, page, limit };
}

/**
 * Create a new Note document and generate a unique slug.
 *
 * @param {Object} data - Form data
 * @returns {Promise<Object>} Populated new note
 */
async function createNote(data) {
  const { title, subjectId, totalPages, samplePages = 3, price, mrp, description, coverImage, tags, author } = data;

  if (!title) {
    throw new AppError("Title is required", 400);
  }
  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    throw new AppError("Invalid subject ID", 400);
  }

  const subjectExists = await Subject.findById(subjectId).lean();
  if (!subjectExists) {
    throw new AppError("Subject not found", 404);
  }

  const p = Number(price);
  const m = mrp !== undefined && mrp !== null ? Number(mrp) : null;
  const tp = Number(totalPages);
  const sp = Number(samplePages);

  if (isNaN(p) || p <= 0) {
    throw new AppError("Price must be greater than 0", 400);
  }
  if (m !== null && (isNaN(m) || m < p)) {
    throw new AppError("MRP must be greater than or equal to price", 400);
  }
  if (isNaN(tp) || tp <= 0) {
    throw new AppError("Total pages must be greater than 0", 400);
  }
  if (isNaN(sp) || sp < 0 || sp >= tp) {
    throw new AppError("Sample pages must be non-negative and less than total pages", 400);
  }

  let baseSlug = slugify(title);
  let slug = baseSlug;
  let counter = 1;
  while (await Note.findOne({ slug }).lean()) {
    counter++;
    slug = `${baseSlug}-${counter}`;
  }

  const note = await Note.create({
    title,
    slug,
    subject: subjectId,
    totalPages: tp,
    samplePages: sp,
    price: p,
    mrp: m,
    description: description ? String(description).trim() : "",
    coverImage: coverImage || null,
    tags: tags || [],
    author: author ? String(author).trim() : "BAMS Notes Team",
    publishStatus: "draft"
  });

  return await Note.findById(note._id).populate("subject").lean();
}

/**
 * Get detailed information about a single Note document.
 *
 * @param {string} id - Note ID
 * @returns {Promise<Object>} Populated note payload
 */
async function getNoteById(id) {
  const note = await Note.findById(id).populate("subject").lean();
  if (!note) {
    throw new AppError("Note not found", 404);
  }

  const [pageCount, ordersSummary] = await Promise.all([
    Page.countDocuments({ note: note._id }),
    Order.aggregate([
      { $match: { note: note._id, status: "paid" } },
      { $group: { _id: null, orderCount: { $sum: 1 }, revenue: { $sum: "$amount" } } }
    ])
  ]);

  return {
    ...note,
    id: note._id,
    pageCount,
    orderCount: ordersSummary[0]?.orderCount || 0,
    revenue: ordersSummary[0]?.revenue || 0
  };
}

/**
 * Update an existing Note document fields and handle transitions.
 *
 * @param {string} id - Note ID
 * @param {Object} data - Update data fields
 * @returns {Promise<Object>} Updated note payload
 */
async function updateNote(id, data) {
  const note = await Note.findById(id);
  if (!note) {
    throw new AppError("Note not found", 404);
  }

  const { title, description, price, mrp, samplePages, publishStatus, coverImage, tags, author } = data;
  const updates = {};

  if (title !== undefined) {
    if (!title) {
      throw new AppError("Title is required", 400);
    }
    updates.title = title;
    if (title !== note.title) {
      let baseSlug = slugify(title);
      let slug = baseSlug;
      let counter = 1;
      while (await Note.findOne({ slug, _id: { $ne: note._id } }).lean()) {
        counter++;
        slug = `${baseSlug}-${counter}`;
      }
      updates.slug = slug;
    }
  }

  if (description !== undefined) {
    updates.description = String(description).replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
  }

  const p = price !== undefined ? Number(price) : note.price;
  const m = mrp !== undefined ? (mrp !== null ? Number(mrp) : null) : note.mrp;
  const sp = samplePages !== undefined ? Number(samplePages) : note.samplePages;

  if (price !== undefined) {
    if (isNaN(p) || p <= 0) {
      throw new AppError("Price must be greater than 0", 400);
    }
    updates.price = p;
  }
  if (mrp !== undefined) {
    if (m !== null && (isNaN(m) || m < p)) {
      throw new AppError("MRP must be greater than or equal to price", 400);
    }
    updates.mrp = m;
  }
  if (samplePages !== undefined) {
    if (isNaN(sp) || sp < 0 || sp >= note.totalPages) {
      throw new AppError("Sample pages must be non-negative and less than total pages", 400);
    }
    updates.samplePages = sp;
  }

  if (coverImage !== undefined) updates.coverImage = coverImage;
  if (tags !== undefined) updates.tags = tags;
  if (author !== undefined) updates.author = String(author).trim();

  if (publishStatus !== undefined) {
    if (!["draft", "published", "archived"].includes(publishStatus)) {
      throw new AppError("Invalid publish status", 400);
    }
    if (publishStatus === "published") {
      const pageCount = await Page.countDocuments({ note: note._id });
      if (pageCount < sp + 1) {
        throw new AppError("Cannot publish: not enough pages uploaded", 400);
      }
      updates.publishedAt = new Date();
    }
    updates.publishStatus = publishStatus;
  }

  return await Note.findByIdAndUpdate(
    note._id,
    { $set: updates },
    { new: true, runValidators: true }
  ).populate("subject").lean();
}

/**
 * Soft delete note by setting status to archived.
 *
 * @param {string} id - Note ID
 * @returns {Promise<boolean>} Success indication
 */
async function deleteNote(id) {
  const note = await Note.findByIdAndUpdate(
    id,
    { $set: { publishStatus: "archived" } },
    { new: true }
  );
  if (!note) {
    throw new AppError("Note not found", 404);
  }
  return true;
}

/**
 * Register pages for a note in bulk.
 *
 * @param {string} noteId - Parent note ID
 * @param {Array<Object>} pages - List of page descriptors
 * @returns {Promise<Object>} Registration outcome summary
 */
async function registerPages(noteId, pages) {
  const note = await Note.findById(noteId);
  if (!note) {
    throw new AppError("Note not found", 404);
  }

  if (!Array.isArray(pages) || pages.length === 0) {
    throw new AppError("Pages must be a non-empty array", 400);
  }
  if (pages.length > 500) {
    throw new AppError("Cannot register more than 500 pages at once", 400);
  }

  const pageNumbers = new Set();
  const allowedTypes = ["image/webp", "image/jpeg", "image/png", "application/pdf"];

  for (const page of pages) {
    const pageNum = Number(page.pageNumber);
    if (isNaN(pageNum) || pageNum <= 0 || !Number.isInteger(pageNum)) {
      throw new AppError("pageNumber must be a positive integer", 400);
    }
    if (!page.s3Key || typeof page.s3Key !== "string" || page.s3Key.trim() === "") {
      throw new AppError("s3Key is required and must be a non-empty string", 400);
    }
    if (!allowedTypes.includes(page.contentType)) {
      throw new AppError("Invalid contentType. Must be one of: " + allowedTypes.join(", "), 400);
    }
    if (pageNumbers.has(pageNum)) {
      throw new AppError(`Duplicate pageNumber ${pageNum} in request`, 400);
    }
    pageNumbers.add(pageNum);
  }

  const existingPages = await Page.find({ note: noteId, pageNumber: { $in: Array.from(pageNumbers) } }).lean();
  if (existingPages.length > 0) {
    throw new AppError(`Pages already registered for this note: ${existingPages.map((p) => p.pageNumber).join(", ")}`, 400);
  }

  const pageDocs = pages.map((p) => {
    let ct = p.contentType;
    if (ct === "application/pdf") {
      ct = "application/octet-stream";
    }
    return {
      note: noteId,
      pageNumber: Number(p.pageNumber),
      s3Key: p.s3Key,
      contentType: ct,
      isSample: p.isSample === true || p.isSample === "true" || Number(p.pageNumber) <= note.samplePages,
      altText: p.altText ? String(p.altText).trim() : ""
    };
  });

  await Page.insertMany(pageDocs);

  const actualPageCount = await Page.countDocuments({ note: noteId });
  note.totalPages = actualPageCount;
  await note.save();

  return { inserted: pageDocs.length, noteId, totalPages: actualPageCount };
}

/**
 * Retrieve pages details for a Note.
 *
 * @param {string} noteId - Parent note ID
 * @returns {Promise<Array<Object>>} Pages list sorted by pageNumber
 */
async function getNotePages(noteId) {
  const noteExists = await Note.findById(noteId).lean();
  if (!noteExists) {
    throw new AppError("Note not found", 404);
  }

  const pages = await Page.find({ note: noteId })
    .sort({ pageNumber: 1 })
    .lean();

  return pages.map((p) => ({
    pageNumber: p.pageNumber,
    contentType: p.contentType,
    isSample: p.isSample,
    createdAt: p.createdAt
  }));
}

/**
 * Delete a single page and its associated S3 object.
 *
 * @param {string} noteId - Note ID
 * @param {number} pageNumber - Page number to delete
 * @returns {Promise<boolean>} Success indication
 */
async function deleteNotePage(noteId, pageNumber) {
  const note = await Note.findById(noteId);
  if (!note) {
    throw new AppError("Note not found", 404);
  }

  const page = await Page.findOne({ note: noteId, pageNumber }).select("+s3Key");
  if (!page) {
    throw new AppError("Page not found", 404);
  }

  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: page.s3Key
    });
    await s3.send(deleteCommand);
  } catch (err) {
    logger.error("Failed to delete page from S3", { s3Key: page.s3Key, error: err.message });
  }

  await Page.deleteOne({ _id: page._id });

  const actualPageCount = await Page.countDocuments({ note: noteId });
  note.totalPages = Math.max(1, actualPageCount);
  await note.save();

  return true;
}

/**
 * Reorder pages of a Note.
 *
 * @param {string} noteId - Parent note ID
 * @param {Array<Object>} pagesToReorder - List of pageNumber and newPageNumber mappings
 * @returns {Promise<Array<Object>>} Reordered pages list
 */
async function reorderNotePages(noteId, pagesToReorder) {
  const note = await Note.findById(noteId);
  if (!note) {
    throw new AppError("Note not found", 404);
  }

  if (!Array.isArray(pagesToReorder) || pagesToReorder.length === 0) {
    throw new AppError("pages array is required", 400);
  }

  const existingPages = await Page.find({ note: noteId }).lean();
  const pageMap = new Map(existingPages.map((p) => [p.pageNumber, p]));

  for (const item of pagesToReorder) {
    if (!pageMap.has(item.pageNumber)) {
      throw new AppError(`Page number ${item.pageNumber} does not exist for this note`, 400);
    }
  }

  const newNumbering = new Map(existingPages.map((p) => [p.pageNumber, p.pageNumber]));
  for (const item of pagesToReorder) {
    const newNum = Number(item.newPageNumber);
    if (isNaN(newNum) || newNum <= 0 || !Number.isInteger(newNum)) {
      throw new AppError("newPageNumber must be a positive integer", 400);
    }
    newNumbering.set(item.pageNumber, newNum);
  }

  const finalNumbers = Array.from(newNumbering.values());
  const uniqueNumbers = new Set(finalNumbers);
  if (finalNumbers.length !== uniqueNumbers.size) {
    throw new AppError("Reordering results in duplicate page numbers", 400);
  }

  const tempOps = [];
  const finalOps = [];

  for (const [oldNum, newNum] of newNumbering.entries()) {
    const pageObj = pageMap.get(oldNum);
    tempOps.push({
      updateOne: {
        filter: { _id: pageObj._id },
        update: { $set: { pageNumber: oldNum + 10000 } }
      }
    });
    finalOps.push({
      updateOne: {
        filter: { _id: pageObj._id },
        update: { $set: { pageNumber: newNum } }
      }
    });
  }

  await Page.bulkWrite(tempOps);
  await Page.bulkWrite(finalOps);

  const updatedPages = await Page.find({ note: noteId }).sort({ pageNumber: 1 }).lean();
  return updatedPages.map((p) => ({
    pageNumber: p.pageNumber,
    contentType: p.contentType,
    isSample: p.isSample,
    createdAt: p.createdAt
  }));
}

/**
 * Get paginated orders list with search and filters.
 *
 * @param {Object} params - Search/filter options
 * @returns {Promise<{ orders: Array, total: number, page: number, limit: number }>} Order list payload
 */
async function getOrders({ page, limit, skip, status, orderType, paymentGateway, dateFrom, dateTo, search }) {
  const filter = {};

  if (status) filter.status = status;
  if (orderType) filter.orderType = orderType;
  if (paymentGateway) filter.paymentGateway = paymentGateway;

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  if (search) {
    const users = await User.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ]
    }).select("_id").lean();
    filter.user = { $in: users.map((u) => u._id) };
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate({ path: "user", select: "name email" })
      .populate({ path: "note", select: "title" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter)
  ]);

  return {
    orders: orders.map((o) => ({
      id: o._id,
      user: o.user ? { name: o.user.name, email: o.user.email } : null,
      orderType: o.orderType,
      note: o.note ? { title: o.note.title } : null,
      year: o.year,
      amount: o.amount,
      status: o.status,
      paymentGateway: o.paymentGateway,
      createdAt: o.createdAt
    })),
    total,
    page,
    limit
  };
}

/**
 * Retrieve complete detailed information about an order.
 *
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>} Full order details payload
 */
async function getOrderById(orderId) {
  const order = await Order.findById(orderId)
    .populate({ path: "user", select: "name email phone" })
    .populate({
      path: "note",
      select: "title subject",
      populate: { path: "subject", select: "name" }
    })
    .select("+gatewaySignature")
    .lean();

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  return {
    ...order,
    id: order._id
  };
}

/**
 * Handle state updates and refund remarks for orders.
 *
 * @param {string} orderId - Order ID
 * @param {string} requestedStatus - New status ('completed' | 'failed' | 'refunded')
 * @param {string} [refundReason] - Reason for refund
 * @returns {Promise<Object>} Updated order details
 */
async function updateOrderStatus(orderId, requestedStatus, refundReason) {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError("Order not found", 404);
  }

  const currentStatus = order.status;
  const targetDbStatus = requestedStatus === "completed" ? "paid" : requestedStatus;

  if (!["paid", "failed", "refunded"].includes(targetDbStatus)) {
    throw new AppError("Invalid status transition requested", 400);
  }

  if (currentStatus === "pending") {
    if (targetDbStatus !== "paid" && targetDbStatus !== "failed") {
      throw new AppError("Invalid state transition. Pending orders can only transition to completed (paid) or failed.", 400);
    }
  } else if (currentStatus === "paid") {
    if (targetDbStatus !== "refunded") {
      throw new AppError("Invalid state transition. Completed (paid) orders can only transition to refunded.", 400);
    }
  } else {
    throw new AppError(`Cannot change status of order in state: ${currentStatus}`, 400);
  }

  const updates = { status: targetDbStatus };

  if (targetDbStatus === "paid") {
    updates.paidAt = new Date();
  }

  if (targetDbStatus === "refunded") {
    if (!refundReason) {
      throw new AppError("Refund reason is required", 400);
    }
    updates.refundedAt = new Date();
    updates.remarks = refundReason;
  }

  const updatedOrder = await Order.findByIdAndUpdate(
    order._id,
    { $set: updates },
    { new: true, runValidators: true }
  ).populate("user", "name email").lean();

  return {
    ...updatedOrder,
    id: updatedOrder._id
  };
}

/**
 * Generate CSV representation of all orders matching search criteria.
 *
 * @param {Object} filterParams - Filter details
 * @returns {Promise<string>} Raw CSV formatted text
 */
async function exportOrdersCsv({ dateFrom, dateTo, status, orderType }) {
  const filter = {};
  if (status) filter.status = status;
  if (orderType) filter.orderType = orderType;
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  const orders = await Order.find(filter)
    .populate({ path: "user", select: "name email" })
    .sort({ createdAt: -1 })
    .lean();

  const headers = ["OrderId", "UserName", "UserEmail", "OrderType", "Amount", "Status", "Gateway", "CreatedAt"];
  const rows = orders.map((o) => [
    o._id.toString(),
    o.user ? o.user.name : "N/A",
    o.user ? o.user.email : "N/A",
    o.orderType,
    o.amount,
    o.status,
    o.paymentGateway,
    o.createdAt.toISOString()
  ]);

  return [
    headers.join(","),
    ...rows.map((r) => r.map((val) => {
      const str = String(val).replace(/"/g, '""');
      return str.includes(",") || str.includes("\n") || str.includes('"') ? `"${str}"` : str;
    }).join(","))
  ].join("\n");
}

/**
 * Retrieve all academic subjects grouped by year and populated with noteCount.
 *
 * @returns {Promise<Object>} Subjects mapped by academic year
 */
async function getSubjects() {
  const subjects = await Subject.aggregate([
    {
      $lookup: {
        from: "notes",
        localField: "_id",
        foreignField: "subject",
        as: "notesList"
      }
    },
    {
      $project: {
        id: "$_id",
        _id: 1,
        name: 1,
        slug: 1,
        year: 1,
        sortOrder: 1,
        description: 1,
        coverImage: 1,
        isActive: 1,
        noteCount: { $size: "$notesList" }
      }
    },
    { $sort: { sortOrder: 1 } }
  ]);

  const grouped = {
    first_year: [],
    second_year: [],
    third_year: [],
    final_year: []
  };

  subjects.forEach((s) => {
    if (grouped[s.year]) {
      grouped[s.year].push(s);
    }
  });

  return grouped;
}

/**
 * Seed or register a new Subject.
 *
 * @param {Object} data - Subject fields
 * @returns {Promise<Object>} Created Subject
 */
async function createSubject({ name, year, sortOrder, description }) {
  if (!name) {
    throw new AppError("Subject name is required", 400);
  }
  if (!["first_year", "second_year", "third_year", "final_year"].includes(year)) {
    throw new AppError("Invalid academic year", 400);
  }
  const order = Number(sortOrder);
  if (isNaN(order) || order < 0) {
    throw new AppError("sortOrder must be a positive number", 400);
  }

  let baseSlug = slugify(name);
  let slug = baseSlug;
  let counter = 1;
  while (await Subject.findOne({ slug }).lean()) {
    counter++;
    slug = `${baseSlug}-${counter}`;
  }

  return await Subject.create({
    name,
    year,
    sortOrder: order,
    description: description ? String(description).trim() : "",
    slug
  });
}

/**
 * Modify metadata details for a Subject document.
 *
 * @param {string} id - Subject ID
 * @param {Object} data - Subject fields
 * @returns {Promise<Object>} Updated Subject details
 */
async function updateSubject(id, data) {
  const subject = await Subject.findById(id);
  if (!subject) {
    throw new AppError("Subject not found", 404);
  }

  const { name, description, sortOrder, isActive } = data;
  const updates = {};

  if (name !== undefined) {
    if (!name) {
      throw new AppError("Name is required", 400);
    }
    updates.name = name;
    if (name !== subject.name) {
      let baseSlug = slugify(name);
      let slug = baseSlug;
      let counter = 1;
      while (await Subject.findOne({ slug, _id: { $ne: subject._id } }).lean()) {
        counter++;
        slug = `${baseSlug}-${counter}`;
      }
      updates.slug = slug;
    }
  }

  if (description !== undefined) {
    updates.description = String(description).trim();
  }

  if (sortOrder !== undefined) {
    const order = Number(sortOrder);
    if (isNaN(order) || order < 0) {
      throw new AppError("sortOrder must be a positive number", 400);
    }
    updates.sortOrder = order;
  }

  if (isActive !== undefined) {
    updates.isActive = isActive === true || isActive === "true";
  }

  const updatedSubject = await Subject.findByIdAndUpdate(
    subject._id,
    { $set: updates },
    { new: true, runValidators: true }
  ).lean();

  return {
    ...updatedSubject,
    id: updatedSubject._id
  };
}

/**
 * Retrieve revenue statistics aggregated over time.
 *
 * @param {string} period - Range ('7d' | '30d' | '90d' | '1y')
 * @param {string} groupBy - Unit ('day' | 'week' | 'month')
 * @returns {Promise<Object>} Labels, revenue amounts, and order counts arrays
 */
async function getRevenueAnalytics(period, groupBy) {
  const now = new Date();
  const startDate = new Date();

  if (period === "7d") {
    startDate.setDate(now.getDate() - 7);
  } else if (period === "30d") {
    startDate.setDate(now.getDate() - 30);
  } else if (period === "90d") {
    startDate.setDate(now.getDate() - 90);
  } else if (period === "1y") {
    startDate.setFullYear(now.getFullYear() - 1);
  } else {
    startDate.setDate(now.getDate() - 30);
  }

  let format = "%Y-%m-%d";
  if (groupBy === "week") {
    format = "%Y-W%V";
  } else if (groupBy === "month") {
    format = "%Y-%m";
  }

  const results = await Order.aggregate([
    {
      $match: {
        status: "paid",
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: format, date: "$createdAt" } },
        revenue: { $sum: "$amount" },
        orders: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const labels = [];
  const revenue = [];
  const orders = [];

  results.forEach((r) => {
    labels.push(r._id);
    revenue.push(r.revenue);
    orders.push(r.orders);
  });

  return { labels, revenue, orders };
}

/**
 * Retrieve new registrations count aggregated over time.
 *
 * @param {string} period - Range ('7d' | '30d' | '90d' | '1y')
 * @returns {Promise<Object>} Labels and user counts arrays
 */
async function getUserAnalytics(period) {
  const now = new Date();
  const startDate = new Date();

  if (period === "7d") {
    startDate.setDate(now.getDate() - 7);
  } else if (period === "30d") {
    startDate.setDate(now.getDate() - 30);
  } else if (period === "90d") {
    startDate.setDate(now.getDate() - 90);
  } else if (period === "1y") {
    startDate.setFullYear(now.getFullYear() - 1);
  } else {
    startDate.setDate(now.getDate() - 30);
  }

  const results = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const labels = [];
  const counts = [];

  results.forEach((r) => {
    labels.push(r._id);
    counts.push(r.count);
  });

  return { labels, counts };
}

/**
 * Get popular notes ranked by sales transaction counts.
 *
 * @returns {Promise<Array>} List of popular notes and details
 */
async function getPopularNotesAnalytics() {
  return await Order.aggregate([
    { $match: { status: "paid", note: { $ne: null } } },
    { $group: { _id: "$note", orderCount: { $sum: 1 }, revenue: { $sum: "$amount" } } },
    { $sort: { orderCount: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "notes",
        localField: "_id",
        foreignField: "_id",
        as: "noteDetails"
      }
    },
    { $unwind: "$noteDetails" },
    {
      $lookup: {
        from: "subjects",
        localField: "noteDetails.subject",
        foreignField: "_id",
        as: "subjectDetails"
      }
    },
    { $unwind: { path: "$subjectDetails", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        title: "$noteDetails.title",
        subject: "$subjectDetails.name",
        orderCount: 1,
        revenue: 1,
        publishStatus: "$noteDetails.publishStatus"
      }
    }
  ]);
}

/**
 * Retrieve active read sessions active within the last 5 minutes.
 *
 * @returns {Promise<Object>} Active sessions count and detail list
 */
async function getActiveSessionsAnalytics() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const activeFilter = {
    isActive: true,
    lastActiveAt: { $gte: fiveMinutesAgo }
  };

  const [count, sessions] = await Promise.all([
    Session.countDocuments(activeFilter),
    Session.find(activeFilter)
      .populate("user", "name")
      .populate("note", "title")
      .sort({ lastActiveAt: -1 })
      .lean()
  ]);

  const list = sessions.map((s) => ({
    user: s.user ? s.user.name : "Unknown",
    note: s.note ? s.note.title : "Browsing Catalog",
    ip: s.ip,
    lastActiveAt: s.lastActiveAt
  }));

  return { count, list };
}

module.exports = {
  getStats,
  getUsers,
  getUserById,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  getNotes,
  createNote,
  getNoteById,
  updateNote,
  deleteNote,
  registerPages,
  getNotePages,
  deleteNotePage,
  reorderNotePages,
  getOrders,
  getOrderById,
  updateOrderStatus,
  exportOrdersCsv,
  getSubjects,
  createSubject,
  updateSubject,
  getRevenueAnalytics,
  getUserAnalytics,
  getPopularNotesAnalytics,
  getActiveSessionsAnalytics
};
