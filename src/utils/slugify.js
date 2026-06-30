/**
 * Slugify Utility.
 *
 * Converts arbitrary text into a URL-friendly kebab-case slug.
 * Removes special characters and trims whitespace.
 *
 * @param {string} text - The input text to convert
 * @returns {string} The slugified string
 */
const slugify = (text) => {
  if (!text) return "";
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // remove non-alphanumeric, spaces, hyphens
    .replace(/\s+/g, "-")      // replace spaces with hyphens
    .replace(/-+/g, "-");      // remove duplicate hyphens
};

module.exports = { slugify };
