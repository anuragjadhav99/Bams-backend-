/**
 * Seed script — populates the Subject collection with the official
 * BAMS syllabus structure (4 years × 4 subjects = 16 subjects).
 *
 * Run with:   npm run seed
 *             node src/seeds/seedSubjects.js
 *
 * Idempotent: uses `updateOne` with `upsert` keyed on `slug`, so
 * re-running the script updates existing docs instead of creating dupes.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Subject = require("../models/Subject");

const SUBJECTS = [
  // ── First Year ──────────────────────────────────────────────
  {
    name: "Padartha Vigyan",
    slug: "padartha-vigyan",
    year: "first_year",
    sortOrder: 1,
    description:
      "Foundational principles of Ayurveda including Padartha (categories of existence), Dravya, Guna, Karma, and Samanya-Vishesha Siddhanta.",
  },
  {
    name: "Sanskrit",
    slug: "sanskrit",
    year: "first_year",
    sortOrder: 2,
    description:
      "Sanskrit language fundamentals, grammar (Vyakarana), and the ability to read classical Ayurvedic texts in their original language.",
  },
  {
    name: "Kriya Sharir",
    slug: "kriya-sharir",
    year: "first_year",
    sortOrder: 3,
    description:
      "Ayurvedic physiology — Dosha, Dhatu, Mala, Agni, Srotas, and their functional interrelationships in health and disease.",
  },
  {
    name: "Rachana Sharir",
    slug: "rachana-sharir",
    year: "first_year",
    sortOrder: 4,
    description:
      "Ayurvedic and modern anatomy — Marma, Sira, Dhamani, Asthi, Sandhi, and comparative anatomical structures.",
  },

  // ── Second Year ─────────────────────────────────────────────
  {
    name: "Dravyaguna",
    slug: "dravyaguna",
    year: "second_year",
    sortOrder: 1,
    description:
      "Ayurvedic pharmacology covering Rasa, Guna, Virya, Vipaka, Prabhava, and detailed materia medica of medicinal plants.",
  },
  {
    name: "Rasashastra",
    slug: "rasashastra",
    year: "second_year",
    sortOrder: 2,
    description:
      "Pharmaceutical science of Ayurveda — Bhasma preparation, Shodhana, Marana, and formulation of mineral and metallic drugs.",
  },
  {
    name: "Rog Nidan",
    slug: "rog-nidan",
    year: "second_year",
    sortOrder: 3,
    description:
      "Ayurvedic pathology and diagnostics — Nidana Panchaka, Vyadhi classification, Ashtavidha and Dashavidha Pariksha.",
  },
  {
    name: "Charak Samhita",
    slug: "charak-samhita",
    year: "second_year",
    sortOrder: 4,
    description:
      "Study of the Charak Samhita — Sutra Sthana, Nidana Sthana, Vimana Sthana, and clinical principles of Ayurvedic medicine.",
  },

  // ── Third Year ──────────────────────────────────────────────
  {
    name: "Agadtantra",
    slug: "agadtantra",
    year: "third_year",
    sortOrder: 1,
    description:
      "Toxicology and forensic medicine in Ayurveda — Visha Vigyan, Sthavara & Jangama Visha, and medico-legal procedures.",
  },
  {
    name: "Swasthavritta",
    slug: "swasthavritta",
    year: "third_year",
    sortOrder: 2,
    description:
      "Preventive and social medicine — Dinacharya, Ritucharya, Sadvritta, Yoga, and public health principles of Ayurveda.",
  },
  {
    name: "Striroga",
    slug: "striroga",
    year: "third_year",
    sortOrder: 3,
    description:
      "Gynaecology and obstetrics in Ayurveda — Yoni Vyapad, Artava Dushti, Garbhini Paricharya, and Prasuti Tantra.",
  },
  {
    name: "Kaumarbhritya",
    slug: "kaumarbhritya",
    year: "third_year",
    sortOrder: 4,
    description:
      "Ayurvedic paediatrics — Bala Roga, Lehana, Swarnaprashana, growth milestones, and childhood disease management.",
  },

  // ── Final Year ──────────────────────────────────────────────
  {
    name: "Kayachikitsa",
    slug: "kayachikitsa",
    year: "final_year",
    sortOrder: 1,
    description:
      "Internal medicine of Ayurveda — Jwara, Atisara, Prameha, Kushtha, Hridroga, and comprehensive Chikitsa protocols.",
  },
  {
    name: "Panchakarma",
    slug: "panchakarma",
    year: "final_year",
    sortOrder: 2,
    description:
      "Five detoxification therapies — Vamana, Virechana, Basti, Nasya, and Raktamokshana with Poorva and Paschat Karma.",
  },
  {
    name: "Shalya Tantra",
    slug: "shalya-tantra",
    year: "final_year",
    sortOrder: 3,
    description:
      "Ayurvedic surgery — Ashtavidha Shastra Karma, Ksharasutra, Agnikarma, wound management, and surgical principles.",
  },
  {
    name: "Shalakya Tantra",
    slug: "shalakya-tantra",
    year: "final_year",
    sortOrder: 4,
    description:
      "ENT and ophthalmology in Ayurveda — Netra Roga, Karna Roga, Nasa Roga, Mukha Roga, and Shiro Roga treatments.",
  },
];

async function seed() {
  try {
    await connectDB();
    console.log("\n🌱  Seeding subjects …\n");

    for (const subj of SUBJECTS) {
      const result = await Subject.updateOne(
        { slug: subj.slug },        // match key
        { $set: subj },             // update all fields
        { upsert: true, runValidators: true }
      );

      const action = result.upsertedCount ? "CREATED" : "UPDATED";
      console.log(`   ${action}  ${subj.year} → ${subj.name}`);
    }

    console.log(`\n✅  Done — ${SUBJECTS.length} subjects seeded.\n`);
  } catch (err) {
    console.error("❌  Seed failed:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

seed();
