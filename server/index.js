import express from "express";
import Database from "better-sqlite3";
import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const db = new Database(path.join(__dirname, "data_senam.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));


db.exec(`
CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  gender TEXT NOT NULL CHECK(gender IN ('pria','wanita')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL,
  month TEXT NOT NULL DEFAULT '',
  week INTEGER NOT NULL,
  sit_stand REAL,
  one_leg REAL,
  toe_touch REAL,
  grip_right REAL,
  grip_left REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  UNIQUE(participant_id, month, week)
);

CREATE TABLE IF NOT EXISTS standards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gender TEXT NOT NULL,
  age_min INTEGER NOT NULL,
  age_max INTEGER NOT NULL,
  sit_fast_max REAL,
  sit_normal_min REAL,
  sit_normal_max REAL,
  sit_slow_min REAL,
  one_low_max REAL,
  one_normal_min REAL,
  one_normal_max REAL,
  one_good_min REAL,
  toe_touch_standard REAL,
  grip_standard REAL,
  UNIQUE(gender, age_min, age_max)
);
`);

// =====================================================
// STANDAR YABG DIGUNAKAN
// =====================================================
const standardsCount = db.prepare("SELECT COUNT(*) AS total FROM standards").get().total;
if (standardsCount === 0) {
  const rows = [
    // gender, age min, age max, sit fast, sit normal min/max, sit slow,
    // one low max, one normal min/max, one good min, toe touch, grip
    ["pria",20,24,6,7,9,10,21,22,66,67,11.5,45.6],
    ["pria",25,29,6,7,9,10,20,21,64,65,10.2,45.1],
    ["pria",30,34,6,7,9,10,16,17,51,52,10.0,46.4],
    ["pria",35,39,6,7,9,10,14,15,44,45,9.5,45.3],
    ["pria",40,44,7,8,10,11,12,13,37,38,8.4,45.3],
    ["pria",45,49,7,8,10,11,10,11,30,31,7.3,45.3],
    ["pria",50,54,7,8,12,13,8,9,24,25,6.1,45.0],
    ["pria",55,59,7,8,12,13,6,7,17,18,5.1,45.4],
    ["pria",60,64,8,9,13,14,4,5,10,11,4.4,42.4],
    ["pria",65,69,8,9,13,14,null,null,null,null,3.3,null],
    ["wanita",20,24,7,8,9,10,20,21,64,65,15.0,27.4],
    ["wanita",25,29,7,8,9,10,20,21,63,64,14.4,27.4],
    ["wanita",30,34,7,8,9,10,16,17,53,54,14.1,28.8],
    ["wanita",35,39,7,8,9,10,14,15,47,48,13.8,28.5],
    ["wanita",40,44,7,8,10,11,12,13,41,42,13.5,28.2],
    ["wanita",45,49,7,8,10,11,10,11,34,35,13.3,28.3],
    ["wanita",50,54,7,8,12,13,8,9,27,28,12.9,27.9],
    ["wanita",55,59,7,8,12,13,6,7,19,20,12.7,26.9],
    ["wanita",60,64,8,9,16,17,4,5,11,12,12.1,26.6],
    ["wanita",65,69,8,9,16,17,null,null,null,null,11.1,null]
  ];

  const insert = db.prepare(`
    INSERT INTO standards
    (gender, age_min, age_max, sit_fast_max, sit_normal_min, sit_normal_max, sit_slow_min,
     one_low_max, one_normal_min, one_normal_max, one_good_min, toe_touch_standard, grip_standard)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const seed = db.transaction(data => data.forEach(row => insert.run(...row)));
  seed(rows);
}


function normalizeGender(value) {
  const v = String(value || "").toLowerCase().trim();
  if (["pria","laki-laki","laki","male","m"].includes(v)) return "pria";
  if (["wanita","perempuan","female","f"].includes(v)) return "wanita";
  return null;
}

function cleanNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function monthOrder(month) {
  const months = {
    januari: 1,
    februari: 2,
    maret: 3,
    april: 4,
    mei: 5,
    juni: 6,
    juli: 7,
    agustus: 8,
    september: 9,
    oktober: 10,
    november: 11,
    desember: 12
  };

  const value = String(month || "").trim().toLowerCase();

  // Jika format YYYY-MM
  if (/^\d{4}-\d{2}$/.test(value)) {
    return Number(value.split("-")[1]);
  }

  return months[value] || 0;
}

function standardFor(age, gender) {
  const g = normalizeGender(gender);
  const a = Number(age);
  if (!g || !Number.isFinite(a)) return null;
  return db.prepare(`
    SELECT * FROM standards
    WHERE gender = ? AND ? BETWEEN age_min AND age_max
    LIMIT 1
  `).get(g, a) || null;
}

function classify(evaluation, standard) {
  const empty = { sit_stand:null, one_leg:null, toe_touch:null, grip_right:null, grip_left:null };
  if (!standard) return empty;

  const sit = cleanNumber(evaluation.sit_stand);
  const one = cleanNumber(evaluation.one_leg);
  const toe = cleanNumber(evaluation.toe_touch);
  const gr = cleanNumber(evaluation.grip_right);
  const gl = cleanNumber(evaluation.grip_left);

  return {
    // Duduk-berdiri: waktu lebih rendah lebih baik.
    sit_stand: sit === null || standard.sit_fast_max === null ? null :
      sit <= standard.sit_fast_max ? "bagus_sekali" :
      sit <= standard.sit_normal_max ? "standar" : "perlu_ditingkatkan",

    // 1 kaki: waktu lebih tinggi lebih baik.
    one_leg: one === null || standard.one_good_min === null ? null :
      one >= standard.one_good_min ? "bagus_sekali" :
      one >= standard.one_normal_min ? "standar" : "perlu_ditingkatkan",

    // Jangkauan: semakin tinggi hasil semakin baik sesuai nilai standar.
    toe_touch: toe === null || standard.toe_touch_standard === null ? null :
      toe >= standard.toe_touch_standard ? "memenuhi" : "perlu_ditingkatkan",

    // Grip: semakin tinggi hasil semakin baik.
    grip_right: gr === null || standard.grip_standard === null ? null :
      gr >= standard.grip_standard ? "memenuhi" : "perlu_ditingkatkan",
    grip_left: gl === null || standard.grip_standard === null ? null :
      gl >= standard.grip_standard ? "memenuhi" : "perlu_ditingkatkan"
  };
}

function doseByGap(gap, direction = "higher") {
  // Ini adalah aturan dosis aplikasi, bukan rumus medis.
  // Dapat diubah kemudian sesuai program latihan resmi yang digunakan.
  const g = Math.abs(Number(gap) || 0);
  if (g <= 3) return { sets:2, reps:8, days:5, duration:30 };
  if (g <= 7) return { sets:3, reps:10, days:5, duration:30 };
  if (g <= 12) return { sets:3, reps:12, days:5, duration:30 };
  return { sets:3, reps:15, days:5, duration:30 };
}

function exercisePlan(menu, gap, type = "reps") {
  const d = doseByGap(gap);
  if (type === "seconds") {
    return { name:menu, dose:`${d.sets} set × ${d.duration} detik`, info:`${d.days} hari/minggu`, target:`Diarahkan untuk mengejar kekurangan ${Math.abs(Number(gap)).toFixed(1)} detik dari target.`, instruction:"Lakukan perlahan, terkontrol, dan hentikan bila muncul nyeri." };
  }
  return { name:menu, dose:`${d.sets} set × ${d.reps} repetisi`, info:`${d.days} hari/minggu`, target:`Diarahkan untuk mengejar gap ${Math.abs(Number(gap)).toFixed(1)} poin/satuan menuju target.`, instruction:"Lakukan dengan gerakan terkontrol dan beri jeda istirahat antarset." };
}

function recommendation(evaluation, standard) {
  if (!standard) {
    return {
      title: "Standar belum tersedia",
      message: "Isi jenis kelamin dan gunakan usia dalam rentang standar 20–69 tahun.",
      items: []
    };
  }

  const c = classify(evaluation, standard);
  const items = [];

  if (c.sit_stand === "perlu_ditingkatkan") {
    const current = cleanNumber(evaluation.sit_stand);
    const target = standard.sit_normal_max;
    const gap = current - target;
    items.push({
      priority:"Tinggi", focus:"Kekuatan kaki", test:"Duduk-Berdiri 10×", current, target, gap, unit:"detik",
      menu:["pelatihan angkat kaki","latihan sepak terjang","pelatihan jongkok"],
      exercises:[exercisePlan("pelatihan angkat kaki", gap), exercisePlan("latihan sepak terjang", gap), exercisePlan("pelatihan jongkok", gap)],
      reason:`Waktu saat ini ${current} detik, sedangkan batas standar ${target} detik atau lebih cepat. Kekurangan target: ${gap.toFixed(1)} detik.`
    });
  }

  if (c.one_leg === "perlu_ditingkatkan") {
    const current = cleanNumber(evaluation.one_leg);
    const target = standard.one_normal_min;
    const gap = target - current;
    items.push({
      priority:"Tinggi", focus:"Keseimbangan", test:"Berdiri satu kaki", current, target, gap, unit:"detik",
      menu:["Peregangan satu kaki sambil berdiri","Pelatihan kekuatan inti"],
      exercises:[exercisePlan("Peregangan satu kaki sambil berdiri", gap, "seconds"), exercisePlan("Pelatihan kekuatan inti", gap)],
      reason:`Durasi saat ini ${current} detik, sedangkan standar minimal ${target} detik. Kekurangan target: ${gap.toFixed(1)} detik.`
    });
  }

  if (c.toe_touch === "perlu_ditingkatkan") {
    const current = cleanNumber(evaluation.toe_touch);
    const target = standard.toe_touch_standard;
    const gap = target - current;
    items.push({
      priority:"Sedang", focus:"Fleksibilitas", test:"Menunduk lama ke depan membungkuk", current, target, gap, unit:"cm",
      menu:["latihan membungkuk ke depan","Silang berdiri membungkuk ke depan","peregangan betis"],
      exercises:[exercisePlan("latihan membungkuk ke depan", gap), exercisePlan("Silang berdiri membungkuk ke depan", gap), exercisePlan("peregangan betis", gap, "seconds")],
      reason:`Hasil saat ini ${current} cm, sedangkan target standar ${target} cm. Kekurangan target: ${gap.toFixed(1)} cm.`
    });
  }

  if (c.grip_right === "perlu_ditingkatkan" || c.grip_left === "perlu_ditingkatkan") {
    const hands = [c.grip_right === "perlu_ditingkatkan" ? "kanan" : null, c.grip_left === "perlu_ditingkatkan" ? "kiri" : null].filter(Boolean);
    const currentValues = hands.map(h => cleanNumber(evaluation[h === "kanan" ? "grip_right" : "grip_left"]));
    const current = Math.min(...currentValues);
    const target = standard.grip_standard;
    const gap = target - current;
    items.push({
      priority:"Sedang", focus:"Kekuatan genggaman", test:`Genggaman tangan ${hands.join(" dan ")}`, current, target, gap, unit:"kg",
      menu:["Latihan gooper (memperkuat kekuatan genggaman)"],
      exercises:[exercisePlan("Latihan gooper (memperkuat kekuatan genggaman)", gap)],
      reason:`Nilai terendah saat ini ${current} kg, sedangkan target standar ${target} kg. Kekurangan target: ${gap.toFixed(1)} kg.`
    });
  }

  if (!items.length) {
    return {
      title:"Pertahankan kondisi saat ini",
      message:"Semua hasil evaluasi terbaru yang tersedia sudah memenuhi atau lebih baik dari standar. Lanjutkan menu senam dan evaluasi mingguan.",
      items:[]
    };
  }

  return {
    title:"Prioritas latihan berikutnya",
    message:"Dosis latihan dihitung dari besar gap terhadap target standar. Aturan dosis ini merupakan aturan aplikasi dan dapat disesuaikan dengan program latihan resmi.",
    items
  };
}

function latestEvaluation(participantId) {
  const rows = db.prepare(`
    SELECT *
    FROM evaluations
    WHERE participant_id = ?
  `).all(participantId);

  if (!rows.length) return null;

  rows.sort((a, b) => {
    const monthDiff =
      monthOrder(b.month) - monthOrder(a.month);

    if (monthDiff !== 0) return monthDiff;

    const weekDiff =
      Number(b.week || 0) - Number(a.week || 0);

    if (weekDiff !== 0) return weekDiff;

    return Number(b.id || 0) - Number(a.id || 0);
  });

  return rows[0];
}

function decorateParticipant(p) {
  const latest = latestEvaluation(p.id);
  const standard = standardFor(p.age, p.gender);

  const classification = latest
    ? classify(latest, standard)
    : {
        sit_stand:null,
        one_leg:null,
        toe_touch:null,
        grip_right:null,
        grip_left:null
      };

  const recommendationData = latest
    ? recommendation(latest, standard)
    : {
        title:"Belum ada evaluasi",
        message:"Tambahkan evaluasi pertama untuk mendapatkan rekomendasi.",
        items:[]
      };

  const history = db.prepare(`
    SELECT *
    FROM evaluations
    WHERE participant_id = ?
  `).all(p.id);

  history.sort((a, b) => {
    const monthDiff =
      monthOrder(a.month) - monthOrder(b.month);

    if (monthDiff !== 0) return monthDiff;

    const weekDiff =
      Number(a.week || 0) - Number(b.week || 0);

    if (weekDiff !== 0) return weekDiff;

    return Number(a.id || 0) - Number(b.id || 0);
  });

  const values = Object.values(classification);

  const complete =
    !!latest &&
    values.every(v => v !== null);

  const needsAttention =
    values.some(
      v => v === "perlu_ditingkatkan"
    );

  return {
    ...p,
    latest_evaluation: latest,
    history,
    standard,
    classification,
    recommendation: recommendationData,
    complete,
    needs_attention: needsAttention
  };
}

function validateEvaluation(body) {
  const week = Number(body.week);
  return {
    month:String(body.month || "").trim(),
    week:Number.isFinite(week) && week >= 1 ? Math.min(5, week) : 1,
    sit_stand:cleanNumber(body.sit_stand),
    one_leg:cleanNumber(body.one_leg),
    toe_touch:cleanNumber(body.toe_touch),
    grip_right:cleanNumber(body.grip_right),
    grip_left:cleanNumber(body.grip_left)
  };
}

app.get("/api/participants", (req,res) => {
  try {
    const rows = db.prepare("SELECT * FROM participants ORDER BY name COLLATE NOCASE ASC").all();
    res.json(rows.map(decorateParticipant));
  } catch (e) { console.error(e); res.status(500).json({error:"Gagal mengambil data peserta"}); }
});

app.post("/api/participants", (req,res) => {
  try {
    const name = String(req.body.name || "").trim();
    const age = Number(req.body.age);
    const gender = normalizeGender(req.body.gender);
    if (!name || !Number.isInteger(age) || age < 1 || !gender) return res.status(400).json({error:"Nama, umur, dan jenis kelamin wajib diisi."});

    const result = db.prepare("INSERT INTO participants (name, age, gender) VALUES (?, ?, ?)").run(name, age, gender);
    const id = Number(result.lastInsertRowid);
    const ev = validateEvaluation(req.body);
    const hasAny = [ev.sit_stand,ev.one_leg,ev.toe_touch,ev.grip_right,ev.grip_left].some(v => v !== null);

    if (hasAny) {
      db.prepare(`INSERT INTO evaluations (participant_id,month,week,sit_stand,one_leg,toe_touch,grip_right,grip_left) VALUES (?,?,?,?,?,?,?,?)`)
        .run(id,ev.month,ev.week,ev.sit_stand,ev.one_leg,ev.toe_touch,ev.grip_right,ev.grip_left);
    }
    res.status(201).json({id});
  } catch (e) { console.error(e); res.status(500).json({error:"Gagal menambah peserta"}); }
});

app.put("/api/participants/:id", (req,res) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body.name || "").trim();
    const age = Number(req.body.age);
    const gender = normalizeGender(req.body.gender);
    if (!name || !Number.isInteger(age) || age < 1 || !gender) return res.status(400).json({error:"Nama, umur, dan jenis kelamin wajib diisi."});
    const result = db.prepare("UPDATE participants SET name=?, age=?, gender=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(name,age,gender,id);
    if (!result.changes) return res.status(404).json({error:"Peserta tidak ditemukan"});
    res.json({ok:true});
  } catch (e) { console.error(e); res.status(500).json({error:"Gagal memperbarui peserta"}); }
});

app.delete("/api/participants/:id", (req,res) => {
  try { db.prepare("DELETE FROM participants WHERE id=?").run(Number(req.params.id)); res.json({ok:true}); }
  catch (e) { console.error(e); res.status(500).json({error:"Gagal menghapus peserta"}); }
});

// =====================================================
// EVALUATIONS
// =====================================================
app.get("/api/participants/:id/evaluations", (req,res) => {
  try {
    const pid = Number(req.params.id);
    const p = db.prepare("SELECT * FROM participants WHERE id=?").get(pid);
    if (!p) return res.status(404).json({error:"Peserta tidak ditemukan"});
    const s = standardFor(p.age,p.gender);
    const rows = db.prepare("SELECT * FROM evaluations WHERE participant_id=? ORDER BY week ASC, id ASC").all(pid);
    res.json(rows.map(e => ({...e,classification:classify(e,s),recommendation:recommendation(e,s)})));
  } catch (e) { console.error(e); res.status(500).json({error:"Gagal mengambil evaluasi"}); }
});

app.post("/api/participants/:id/evaluations", (req,res) => {
  try {
    const pid = Number(req.params.id);

    const p = db.prepare(
      "SELECT * FROM participants WHERE id=?"
    ).get(pid);

    if (!p) {
      return res.status(404).json({
        error:"Peserta tidak ditemukan"
      });
    }

    const ev = validateEvaluation(req.body);

    // Cek apakah evaluasi bulan + minggu tersebut sudah ada
    const existing = db.prepare(`
      SELECT id
      FROM evaluations
      WHERE participant_id = ?
        AND month = ?
        AND week = ?
    `).get(pid, ev.month, ev.week);

    if (existing) {

      // Jika sudah ada → UPDATE data lama
      db.prepare(`
        UPDATE evaluations
        SET
          sit_stand = ?,
          one_leg = ?,
          toe_touch = ?,
          grip_right = ?,
          grip_left = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        ev.sit_stand,
        ev.one_leg,
        ev.toe_touch,
        ev.grip_right,
        ev.grip_left,
        existing.id
      );

      return res.json({
        ok: true,
        id: existing.id,
        action: "updated",
        message: "Evaluasi berhasil diperbarui."
      });
    }

    // Jika belum ada → INSERT data baru
    const result = db.prepare(`
      INSERT INTO evaluations
      (
        participant_id,
        month,
        week,
        sit_stand,
        one_leg,
        toe_touch,
        grip_right,
        grip_left
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      pid,
      ev.month,
      ev.week,
      ev.sit_stand,
      ev.one_leg,
      ev.toe_touch,
      ev.grip_right,
      ev.grip_left
    );

    return res.status(201).json({
      ok: true,
      id: Number(result.lastInsertRowid),
      action: "created",
      message: "Evaluasi berhasil ditambahkan."
    });

  } catch (e) {
    console.error(e);

    res.status(500).json({
      error:"Gagal menyimpan evaluasi"
    });
  }
});

app.put("/api/evaluations/:id", (req,res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare("SELECT * FROM evaluations WHERE id=?").get(id);
    if (!existing) return res.status(404).json({error:"Evaluasi tidak ditemukan"});
    const ev = validateEvaluation(req.body);
    db.prepare(`UPDATE evaluations SET month=?,week=?,sit_stand=?,one_leg=?,toe_touch=?,grip_right=?,grip_left=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(ev.month,ev.week,ev.sit_stand,ev.one_leg,ev.toe_touch,ev.grip_right,ev.grip_left,id);
    res.json({ok:true});
  } catch (e) {
    console.error(e);
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({error:"Minggu evaluasi tersebut sudah digunakan peserta ini."});
    res.status(500).json({error:"Gagal memperbarui evaluasi"});
  }
});

app.delete("/api/evaluations/:id", (req,res) => {
  try {
    const id = Number(req.params.id);
    const result = db.prepare("DELETE FROM evaluations WHERE id=?").run(id);
    if (!result.changes) return res.status(404).json({error:"Evaluasi tidak ditemukan"});
    res.json({ok:true});
  } catch (e) { console.error(e); res.status(500).json({error:"Gagal menghapus evaluasi"}); }
});

// =====================================================
// STANDARDS
// =====================================================
app.get("/api/standards", (req,res) => {
  try { res.json(db.prepare("SELECT * FROM standards ORDER BY gender, age_min").all()); }
  catch (e) { console.error(e); res.status(500).json({error:"Gagal mengambil standar"}); }
});

app.get("/api/stats", (req,res) => {
  try {
    const participants = db.prepare("SELECT COUNT(*) AS n FROM participants").get().n;
    const evaluations = db.prepare("SELECT COUNT(*) AS n FROM evaluations").get().n;
    res.json({participants,evaluations});
  } catch (e) { res.status(500).json({error:"Gagal mengambil statistik"}); }
});

function genderLabelPdf(gender) {
  return gender === "pria"
    ? "Pria"
    : gender === "wanita"
      ? "Wanita"
      : "-";
}


function pdfValue(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "-";
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n.toFixed(1).replace(".0", "")
    : String(value);
}


function drawEvaluationTable(
  doc,
  evaluation,
  standard
) {
  const x = 45;
  const width =
    doc.page.width - 90;

  const startY =
    doc.y;

  const classification =
    classify(
      evaluation,
      standard
    );

  const rows = [
    {
      test: "Duduk-Berdiri 10×",
      value: pdfValue(
        evaluation.sit_stand
      ),
      unit: "detik",
      standard: standard
        ? `≤ ${pdfValue(
            standard.sit_normal_max
          )} detik`
        : "-",
      status:
        classification.sit_stand
    },

    {
      test: "Berdiri 1 Kaki",
      value: pdfValue(
        evaluation.one_leg
      ),
      unit: "detik",
      standard: standard
        ? `≥ ${pdfValue(
            standard.one_normal_min
          )} detik`
        : "-",
      status:
        classification.one_leg
    },

    {
      test: "Jangkauan / Membungkuk",
      value: pdfValue(
        evaluation.toe_touch
      ),
      unit: "cm",
      standard: standard
        ? `≥ ${pdfValue(
            standard.toe_touch_standard
          )} cm`
        : "-",
      status:
        classification.toe_touch
    },

    {
      test: "Genggaman Kanan",
      value: pdfValue(
        evaluation.grip_right
      ),
      unit: "kg",
      standard: standard
        ? `≥ ${pdfValue(
            standard.grip_standard
          )} kg`
        : "-",
      status:
        classification.grip_right
    },

    {
      test: "Genggaman Kiri",
      value: pdfValue(
        evaluation.grip_left
      ),
      unit: "kg",
      standard: standard
        ? `≥ ${pdfValue(
            standard.grip_standard
          )} kg`
        : "-",
      status:
        classification.grip_left
    }
  ];

  // =====================================================
  // JUDUL
  // =====================================================

  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor("#123b4a")
    .text(
      "DETAIL HASIL TEST",
      x,
      startY
    );

  // =====================================================
  // HEADER TABEL
  // =====================================================

  let y =
    startY + 17;

  const headerHeight = 20;

  doc
    .roundedRect(
      x,
      y,
      width,
      headerHeight,
      4
    )
    .fill("#123b4a");

  doc
    .font("Helvetica-Bold")
    .fontSize(7.3)
    .fillColor("#ffffff")

    .text(
      "Tes",
      x + 9,
      y + 6,
      {
        width: 185
      }
    )

    .text(
      "Hasil",
      x + 194,
      y + 6,
      {
        width: 75,
        align: "center"
      }
    )

    .text(
      "Standar",
      x + 269,
      y + 6,
      {
        width: 115,
        align: "center"
      }
    )

    .text(
      "Status",
      x + 384,
      y + 6,
      {
        width: 95,
        align: "center"
      }
    );

  y += headerHeight;

  // =====================================================
  // ISI TABEL
  // =====================================================

  rows.forEach(
    (row, index) => {

      const rowHeight = 21;

      // Background selang-seling
      if (index % 2 === 0) {
        doc
          .rect(
            x,
            y,
            width,
            rowHeight
          )
          .fill("#f6faf9");
      }

      // Tes
      doc
        .font("Helvetica")
        .fontSize(7.2)
        .fillColor("#344b54")
        .text(
          row.test,
          x + 9,
          y + 6,
          {
            width: 180,
            lineBreak: false
          }
        );

      // Hasil
      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor("#123b4a")
        .text(
          `${row.value} ${row.unit}`,
          x + 194,
          y + 6,
          {
            width: 75,
            align: "center",
            lineBreak: false
          }
        );

      // Standar
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#64777d")
        .text(
          row.standard,
          x + 269,
          y + 6,
          {
            width: 115,
            align: "center",
            lineBreak: false
          }
        );

      // Status
      let statusText = "-";
      let statusColor =
        "#7a898d";

      if (
        row.status ===
        "perlu_ditingkatkan"
      ) {
        statusText =
          "Perlu ditingkatkan";

        statusColor =
          "#b77900";
      }
      else if (
        row.status
      ) {
        statusText =
          "Memenuhi";

        statusColor =
          "#16836e";
      }

      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor(
          statusColor
        )
        .text(
          statusText,
          x + 384,
          y + 6,
          {
            width: 95,
            align: "center",
            lineBreak: false
          }
        );

      // Garis
      doc
        .moveTo(
          x,
          y + rowHeight
        )
        .lineTo(
          x + width,
          y + rowHeight
        )
        .lineWidth(0.3)
        .strokeColor(
          "#dce7e9"
        )
        .stroke();

      y += rowHeight;
    }
  );

  // =====================================================
  // POSISI BERIKUTNYA
  // =====================================================

  doc.y =
    y + 6;

  doc.fillColor("#000000");
}

function drawClassification(
  doc,
  evaluation,
  standard
) {
  const c = classify(
    evaluation,
    standard
  );

  const pageWidth = doc.page.width;
  const margin = 45;
  const contentWidth = pageWidth - margin * 2;

  if (doc.y > 610) {
    doc.addPage();

    drawPdfHeader(
      doc,
      "HASIL EVALUASI",
      "Status hasil evaluasi peserta"
    );
  }

  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .fillColor("#123b4a")
    .text("Status Hasil", margin);

  doc.moveDown(0.5);

  const rows = [
    [
      "Duduk-Berdiri",
      classificationLabel(c.sit_stand)
    ],
    [
      "Berdiri 1 Kaki",
      classificationLabel(c.one_leg)
    ],
    [
      "Jangkauan",
      classificationLabel(c.toe_touch)
    ],
    [
      "Genggaman Kanan",
      classificationLabel(c.grip_right)
    ],
    [
      "Genggaman Kiri",
      classificationLabel(c.grip_left)
    ]
  ];

  const col1 = margin;
  const col2 = margin + 250;

  const rowHeight = 25;

  // Header tabel
  doc
    .roundedRect(
      margin,
      doc.y,
      contentWidth,
      25,
      5
    )
    .fill("#e8f5f2");

  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor("#123b4a")
    .text(
      "Jenis Tes",
      col1 + 10,
      doc.y + 8
    )
    .text(
      "Status",
      col2,
      doc.y + 8
    );

  doc.y += rowHeight;

  rows.forEach((row, index) => {

    const y = doc.y;

    // background selang-seling
    if (index % 2 === 0) {
      doc
        .rect(
          margin,
          y,
          contentWidth,
          rowHeight
        )
        .fill("#f8fbfb");
    }

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#344b54")
      .text(
        row[0],
        col1 + 10,
        y + 8,
        {
          width: 220
        }
      );

    let statusText = row[1];

    if (statusText === "Bagus sekali") {
      statusText = "Bagus sekali";
    } else if (
      statusText === "Memenuhi standar"
    ) {
      statusText = "Memenuhi standar";
    } else if (
      statusText === "Perlu ditingkatkan"
    ) {
      statusText = "Perlu ditingkatkan";
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor(
        statusText === "Perlu ditingkatkan"
          ? "#b77900"
          : "#16836e"
      )
      .text(
        statusText,
        col2,
        y + 8
      );

    doc.y += rowHeight;
  });

  // Border bawah
  doc
    .moveTo(margin, doc.y)
    .lineTo(
      margin + contentWidth,
      doc.y
    )
    .lineWidth(0.7)
    .strokeColor("#dce7e9")
    .stroke();

  doc.y += 12;

  doc.fillColor("#000000");
}

function classificationLabel(value) {
  if (
    value === "bagus_sekali"
  ) {
    return "Bagus sekali";
  }

  if (
    value === "standar" ||
    value === "memenuhi"
  ) {
    return "Memenuhi standar";
  }

  if (
    value === "perlu_ditingkatkan"
  ) {
    return "Perlu ditingkatkan";
  }

  return "Belum ada data";
}


function drawRecommendation(
  doc,
  evaluation,
  standard
) {
  const data =
    recommendation(
      evaluation,
      standard
    );

  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text("Rekomendasi Latihan");

  doc.moveDown(0.4);

  doc
    .fontSize(9)
    .font("Helvetica")
    .text(data.message);

  if (!data.items.length) {
    doc.moveDown(0.5);
    return;
  }

  doc.moveDown(0.5);

  data.items.forEach(item => {

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .text(
        `${item.focus} — ${item.priority}`
      );

    item.exercises.forEach(exercise => {

      doc
        .fontSize(9)
        .font("Helvetica")
        .text(
          `• ${exercise.name}: ${exercise.dose}, ${exercise.info}`
        );
    });

    doc.moveDown(0.5);
  });
}


function drawAverageRow(
  doc,
  label,
  value,
  unit
) {
  doc
    .fontSize(10)
    .font("Helvetica")
    .text(
      `${label}: ${pdfValue(value)} ${unit}`
    );
}


// =====================================================
// KOMPONEN VISUAL PDF (hanya tampilan, tidak mengubah logika data)
// =====================================================
function drawPdfHeader(doc, title, subtitle) {
  const imgDir = path.join(__dirname, "../public/assets/img");

  const leftLogo = path.join(imgDir, "Logo_FJI.png");
  const rightLogo = path.join(imgDir, "Logo_FLC.png");

  const pageWidth = doc.page.width;
  const margin = 45;

  const logoSize = 58;
  const logoY = 30;

  // =====================================================
  // HEADER AREA
  // =====================================================

  // Logo kiri
  try {
    doc.image(leftLogo, margin, logoY, {
      fit: [logoSize, logoSize],
      align: "left",
      valign: "center"
    });
  } catch (e) {
    console.warn("Logo FJI tidak dapat dimuat:", e.message);
  }

  // Logo kanan
  try {
    doc.image(
      rightLogo,
      pageWidth - margin - logoSize,
      logoY,
      {
        fit: [logoSize, logoSize],
        align: "right",
        valign: "center"
      }
    );
  } catch (e) {
    console.warn("Logo FLC tidak dapat dimuat:", e.message);
  }

  // Area judul benar-benar berada di tengah halaman
  const titleX = margin + 70;
  const titleWidth = pageWidth - (margin * 2) - 140;

  doc
    .fillColor("#123b4a")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(title, titleX, 38, {
      width: titleWidth,
      align: "center"
    });

  doc
    .fillColor("#60747a")
    .font("Helvetica")
    .fontSize(8.5)
    .text(subtitle, titleX, 62, {
      width: titleWidth,
      align: "center"
    });

  // Garis pemisah
  doc
    .moveTo(margin, 103)
    .lineTo(pageWidth - margin, 103)
    .lineWidth(1.5)
    .strokeColor("#20a58a")
    .stroke();

  // Garis kecil dekoratif
  doc
    .moveTo(margin, 108)
    .lineTo(pageWidth - margin, 108)
    .lineWidth(0.5)
    .strokeColor("#dce7e9")
    .stroke();

  doc.fillColor("#000000");
  doc.strokeColor("#000000");
  doc.lineWidth(1);

  doc.y = 125;
}

function drawPdfTrendCharts(doc, evaluations) {
  const metrics = [
    { key: "sit_stand", label: "Duduk-Berdiri 10×", unit: "detik" },
    { key: "one_leg", label: "Berdiri 1 Kaki", unit: "detik" },
    { key: "toe_touch", label: "Jangkauan", unit: "cm" },
    { key: "grip_right", label: "Genggaman Kanan", unit: "kg" },
    { key: "grip_left", label: "Genggaman Kiri", unit: "kg" }
  ];
  const rows = evaluations.slice().sort((a, b) => a.week - b.week);
  metrics.forEach(metric => {
    const points = rows.map(e => ({ week: e.week, value: Number(e[metric.key]) }))
      .filter(p => Number.isFinite(p.value));
    if (!points.length) return;
    if (doc.y > 625) doc.addPage();
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#123b4a")
      .text(metric.label, 50, doc.y, { continued: false });
    const top = doc.y + 7, left = 80, width = 420, height = 70;
    const min = Math.min(...points.map(p => p.value));
    const max = Math.max(...points.map(p => p.value));
    const pad = Math.max((max - min) * 0.18, Math.abs(max || 1) * 0.06, 0.5);
    const lo = min - pad, hi = max + pad;
    const xAt = i => points.length === 1 ? left + width / 2 : left + i * width / (points.length - 1);
    const yAt = v => top + height - ((v - lo) / (hi - lo)) * height;
    doc.save().lineWidth(0.6).strokeColor("#dce7e9");
    for (let g = 0; g <= 2; g++) {
      const gy = top + g * height / 2;
      doc.moveTo(left, gy).lineTo(left + width, gy).stroke();
    }
    doc.restore();
    doc.lineWidth(2).strokeColor("#20a58a");
    points.forEach((p, i) => {
      if (i) doc.moveTo(xAt(i - 1), yAt(points[i - 1].value)).lineTo(xAt(i), yAt(p.value)).stroke();
      doc.circle(xAt(i), yAt(p.value), 3.5).fillAndStroke("#20a58a", "#ffffff");
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#123b4a")
        .text(pdfValue(p.value), xAt(i) - 25, yAt(p.value) - 16, { width: 50, align: "center" });
      doc.font("Helvetica").fontSize(8).fillColor("#64777d")
        .text(`M${p.week}`, xAt(i) - 15, top + height + 5, { width: 30, align: "center" });
    });
    doc.font("Helvetica-Oblique").fontSize(7).fillColor("#64777d")
      .text(`Satuan: ${metric.unit}`, 50, top + height + 18);
    doc.y = top + height + 32;
    doc.fillColor("#000000");
  });
}

function drawPdfLineChart(
  doc,
  title,
  evaluations,
  metricKey,
  metricLabel,
  unit
) {
  const rows = evaluations
    .slice()
    .sort((a, b) => Number(a.week) - Number(b.week));

  const points = rows
    .map(e => ({
      week: Number(e.week),
      value: Number(e[metricKey])
    }))
    .filter(p => Number.isFinite(p.value));

  if (!points.length) return;

  // Jika ruang tidak cukup, buat halaman baru
  if (doc.y > 640) {
    doc.addPage();
    drawPdfHeader(
      doc,
      "GRAFIK PERKEMBANGAN",
      metricLabel
    );
  }

  const pageWidth = doc.page.width;
  const margin = 55;

  const chartLeft = 95;
  const chartRight = pageWidth - 60;
  const chartTop = doc.y + 30;
  const chartBottom = chartTop + 155;

  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;

  const minValue = Math.min(...points.map(p => p.value));
  const maxValue = Math.max(...points.map(p => p.value));

  let range = maxValue - minValue;

  if (range === 0) {
    range = Math.max(Math.abs(maxValue) * 0.2, 1);
  }

  const padding = range * 0.18;

  const minY = minValue - padding;
  const maxY = maxValue + padding;

  // =====================================================
  // JUDUL GRAFIK
  // =====================================================

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#123b4a")
    .text(title, margin, doc.y);

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#64777d")
    .text(
      `Satuan: ${unit}  •  Semakin mudah dibaca berdasarkan perubahan hasil tiap minggu`,
      margin,
      doc.y + 3
    );

  // =====================================================
  // GRID
  // =====================================================

  doc.save();

  doc
    .lineWidth(0.6)
    .strokeColor("#dce7e9");

  const gridCount = 4;

  for (let i = 0; i <= gridCount; i++) {
    const y =
      chartTop +
      (chartHeight / gridCount) * i;

    doc
      .moveTo(chartLeft, y)
      .lineTo(chartRight, y)
      .stroke();
  }

  doc.restore();

  // =====================================================
  // Y AXIS LABEL
  // =====================================================

  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor("#64777d");

  for (let i = 0; i <= gridCount; i++) {
    const value =
      maxY -
      ((maxY - minY) / gridCount) * i;

    const y =
      chartTop +
      (chartHeight / gridCount) * i -
      4;

    doc.text(
      pdfValue(value),
      50,
      y,
      {
        width: 35,
        align: "right"
      }
    );
  }

  // =====================================================
  // POSISI TITIK
  // =====================================================

  const xAt = index => {
    if (points.length === 1) {
      return chartLeft + chartWidth / 2;
    }

    return (
      chartLeft +
      index *
        (chartWidth / (points.length - 1))
    );
  };

  const yAt = value => {
    return (
      chartBottom -
      ((value - minY) / (maxY - minY)) *
        chartHeight
    );
  };

  // =====================================================
  // GARIS GRAFIK
  // =====================================================

  doc
    .save()
    .lineWidth(2.5)
    .strokeColor("#20a58a");

  for (let i = 1; i < points.length; i++) {
    doc
      .moveTo(
        xAt(i - 1),
        yAt(points[i - 1].value)
      )
      .lineTo(
        xAt(i),
        yAt(points[i].value)
      )
      .stroke();
  }

  doc.restore();

  // =====================================================
  // TITIK + NILAI
  // =====================================================

  points.forEach((point, index) => {

    const x = xAt(index);
    const y = yAt(point.value);

    // titik
    doc
      .circle(x, y, 4.5)
      .fill("#20a58a");

    doc
      .circle(x, y, 2)
      .fill("#ffffff");

    // nilai
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor("#123b4a")
      .text(
        pdfValue(point.value),
        x - 24,
        y - 18,
        {
          width: 48,
          align: "center"
        }
      );

    // label minggu
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#64777d")
      .text(
        `M${point.week}`,
        x - 15,
        chartBottom + 8,
        {
          width: 30,
          align: "center"
        }
      );
  });

  // =====================================================
  // LABEL SUMBU
  // =====================================================

  doc
    .font("Helvetica-Oblique")
    .fontSize(7)
    .fillColor("#64777d")
    .text(
      "Minggu evaluasi",
      chartLeft,
      chartBottom + 24,
      {
        width: chartWidth,
        align: "center"
      }
    );

  doc.y = chartBottom + 42;

  doc.fillColor("#000000");
}

function drawRapotTrendChart(
  doc,
  evaluations,
  standard
) {
  const x = 45;
  const width = doc.page.width - 90;

  // =====================================================
  // JUDUL
  // =====================================================

  const titleY = doc.y;

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#123b4a")
    .text(
      "PERKEMBANGAN HASIL TEST",
      x,
      titleY
    );

  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor("#64777d")
    .text(
      "Perkembangan hasil evaluasi berdasarkan minggu pengukuran",
      x,
      titleY + 14
    );

  // =====================================================
  // DATA
  // =====================================================

  const rows = evaluations
    .slice()
    .sort(
      (a, b) =>
        Number(a.week) - Number(b.week)
    )
    .slice(0, 5);

  const points = rows.map(e => {

    const c =
      classify(
        e,
        standard
      );

    let total = 0;
    let count = 0;

    const metrics = [
      ["sit_stand", c.sit_stand],
      ["one_leg", c.one_leg],
      ["toe_touch", c.toe_touch],
      ["grip_right", c.grip_right],
      ["grip_left", c.grip_left]
    ];

    metrics.forEach(
      ([key, status]) => {

        if (
          e[key] === null ||
          e[key] === undefined
        ) {
          return;
        }

        if (!status) {
          return;
        }

        let score = 0;

        if (
          status === "bagus_sekali" ||
          status === "memenuhi"
        ) {
          score = 100;
        } else if (
          status === "standar"
        ) {
          score = 85;
        } else {
          score = 60;
        }

        total += score;
        count++;
      }
    );

    return {
      week: Number(e.week),
      value:
        count > 0
          ? total / count
          : 0
    };
  });

  // =====================================================
  // BOX GRAFIK
  // =====================================================

  const boxY =
    titleY + 29;

  const boxHeight =
    132;

  doc
    .roundedRect(
      x,
      boxY,
      width,
      boxHeight,
      7
    )
    .fill("#f8fbfa");

  doc
    .roundedRect(
      x,
      boxY,
      width,
      boxHeight,
      7
    )
    .lineWidth(0.5)
    .strokeColor("#dce7e9")
    .stroke();

  // =====================================================
  // AREA CHART
  // =====================================================

  const chartX =
    x + 38;

  const chartY =
    boxY + 14;

  const chartWidth =
    width - 53;

  const chartHeight =
    82;

  // =====================================================
  // GRID
  // =====================================================

  doc
    .save()
    .lineWidth(0.4)
    .strokeColor("#dce7e9");

  [0, 25, 50, 75, 100]
    .forEach(value => {

      const gy =
        chartY +
        chartHeight -
        (value / 100) *
          chartHeight;

      doc
        .moveTo(
          chartX,
          gy
        )
        .lineTo(
          chartX + chartWidth,
          gy
        )
        .stroke();

      doc
        .font("Helvetica")
        .fontSize(6)
        .fillColor("#7b898d")
        .text(
          `${value}%`,
          x + 7,
          gy - 3,
          {
            width: 25,
            align: "right"
          }
        );
    });

  doc.restore();

  // =====================================================
  // GRAFIK LINE
  // =====================================================

  if (points.length) {

    const xAt = index => {

      if (points.length === 1) {
        return (
          chartX +
          chartWidth / 2
        );
      }

      return (
        chartX +
        index *
          (
            chartWidth /
            (points.length - 1)
          )
      );
    };

    const yAt = value =>
      chartY +
      chartHeight -
      (value / 100) *
        chartHeight;

    // Garis
    doc
      .save()
      .lineWidth(2)
      .strokeColor("#20a58a");

    for (
      let i = 1;
      i < points.length;
      i++
    ) {

      doc
        .moveTo(
          xAt(i - 1),
          yAt(
            points[i - 1].value
          )
        )
        .lineTo(
          xAt(i),
          yAt(
            points[i].value
          )
        )
        .stroke();
    }

    doc.restore();

    // Titik
    points.forEach(
      (point, index) => {

        const px =
          xAt(index);

        const py =
          yAt(point.value);

        // titik luar
        doc
          .circle(
            px,
            py,
            3.5
          )
          .fill("#20a58a");

        // titik tengah
        doc
          .circle(
            px,
            py,
            1.5
          )
          .fill("#ffffff");

        // nilai
        doc
          .font("Helvetica-Bold")
          .fontSize(6.5)
          .fillColor("#123b4a")
          .text(
            `${Math.round(
              point.value
            )}%`,
            px - 16,
            py - 14,
            {
              width: 32,
              align: "center"
            }
          );

        // minggu
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .fillColor("#64777d")
          .text(
            `M${point.week}`,
            px - 10,
            chartY +
              chartHeight +
              5,
            {
              width: 20,
              align: "center"
            }
          );
      }
    );
  }

  // =====================================================
  // KETERANGAN
  // =====================================================

  doc
    .font("Helvetica-Oblique")
    .fontSize(6)
    .fillColor("#64777d")
    .text(
      "Persentase menunjukkan tingkat pemenuhan standar setiap minggu.",
      x + 10,
      boxY + 113
    );

  // =====================================================
  // POSISI SETELAH GRAFIK
  // =====================================================

  doc.y =
    boxY +
    boxHeight +
    9;

  doc.fillColor("#000000");
}

function drawRapotRecommendation(
  doc,
  evaluation,
  standard
) {
  const data = recommendation(
    evaluation,
    standard
  );

  const x = 45;
  const width = doc.page.width - 90;

  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor("#123b4a")
    .text("REKOMENDASI LATIHAN", x, doc.y);

  const titleY = doc.y;
  const boxTop = titleY + 9;
  const boxHeight = 54;

  // Background
  doc
    .roundedRect(
      x,
      boxTop,
      width,
      boxHeight,
      6
    )
    .fill("#f8fbfa");

  // Border
  doc
    .roundedRect(
      x,
      boxTop,
      width,
      boxHeight,
      6
    )
    .lineWidth(0.5)
    .strokeColor("#dce7e9")
    .stroke();

  if (!data.items.length) {

    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor("#344b54")
      .text(
        "• Pertahankan latihan secara rutin dan lakukan evaluasi mingguan.",
        x + 10,
        boxTop + 11,
        {
          width: width - 20
        }
      );

  } else {

    let y = boxTop + 8;

    data.items
      .slice(0, 3)
      .forEach(item => {

        const exercise =
          item.exercises &&
          item.exercises.length
            ? item.exercises[0]
            : null;

        if (!exercise) return;

        // Nama latihan
        doc
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .fillColor("#123b4a")
          .text(
            `• ${exercise.name}`,
            x + 10,
            y,
            {
              width: 245,
              lineBreak: false
            }
          );

        // Dosis latihan
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor("#64777d")
          .text(
            `${exercise.dose}, ${exercise.info}`,
            x + 255,
            y,
            {
              width: width - 265,
              align: "right",
              lineBreak: false
            }
          );

        y += 15;
      });
  }

  // Posisi setelah box
  doc.y = boxTop + boxHeight + 7;

  doc.fillColor("#000000");
}


function drawRapotConclusion(
  doc,
  evaluation,
  standard
) {
  const classification =
    classify(evaluation, standard);

  const values =
    Object.values(classification);

  const needsAttention =
    values.some(
      value =>
        value === "perlu_ditingkatkan"
    );

  const allComplete =
    values.length > 0 &&
    values.every(
      value => value !== null
    );

  let conclusion;

  if (!allComplete) {

    conclusion =
      "Hasil evaluasi belum lengkap. Beberapa jenis tes belum memiliki data sehingga pemantauan belum dapat dinilai secara keseluruhan.";

  } else if (needsAttention) {

    conclusion =
      "Masih terdapat beberapa aspek yang perlu ditingkatkan. Latihan rutin dan evaluasi berkala disarankan untuk memantau perkembangan.";

  } else {

    conclusion =
      "Seluruh aspek yang dinilai telah memenuhi standar. Pertahankan melalui latihan rutin dan evaluasi berkala.";
  }

  const x = 45;
  const width = doc.page.width - 90;

  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor("#123b4a")
    .text("KESIMPULAN", x, doc.y);

  const titleY = doc.y;
  const boxTop = titleY + 9;
  const boxHeight = 48;

  // Background
  doc
    .roundedRect(
      x,
      boxTop,
      width,
      boxHeight,
      6
    )
    .fill("#f8fbfa");

  // Border
  doc
    .roundedRect(
      x,
      boxTop,
      width,
      boxHeight,
      6
    )
    .lineWidth(0.5)
    .strokeColor("#dce7e9")
    .stroke();

  doc
    .font("Helvetica")
    .fontSize(7.7)
    .fillColor("#344b54")
    .text(
      conclusion,
      x + 10,
      boxTop + 9,
      {
        width: width - 20,
        lineGap: 1.5
      }
    );

  // Posisi setelah box
  doc.y = boxTop + boxHeight + 7;

  doc.fillColor("#000000");
}

function drawPdfBarChart(doc, title, items) {
  const x = 55;
  const y = doc.y + 15;

  const chartWidth = doc.page.width - 110;
  const chartHeight = 230;

  const validItems = items.filter(
    item =>
      Number.isFinite(Number(item.value))
  );

  if (!validItems.length) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#64777d")
      .text(
        "Belum ada data yang dapat ditampilkan pada grafik."
      );

    doc.y = y + 30;
    return;
  }

  // =====================================================
  // JUDUL
  // =====================================================

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#123b4a")
    .text(
      title,
      x,
      y
    );

  // =====================================================
  // AREA GRAFIK
  // =====================================================

  const graphTop = y + 30;
  const graphLeft = x + 45;
  const graphBottom =
    graphTop + chartHeight;

  const graphRight =
    x + chartWidth;

  const graphWidth =
    graphRight - graphLeft;

  // Nilai maksimum
  const maxValue =
    Math.max(
      ...validItems.map(
        item => Number(item.value)
      )
    );

  const safeMax =
    maxValue > 0
      ? maxValue * 1.2
      : 10;

  // =====================================================
  // GRID HORIZONTAL
  // =====================================================

  const gridCount = 5;

  for (let i = 0; i <= gridCount; i++) {

    const ratio =
      i / gridCount;

    const gy =
      graphBottom -
      ratio * chartHeight;

    doc
      .moveTo(
        graphLeft,
        gy
      )
      .lineTo(
        graphRight,
        gy
      )
      .lineWidth(0.5)
      .strokeColor("#e1eaec")
      .stroke();

    const gridValue =
      safeMax * ratio;

    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#7b8c91")
      .text(
        gridValue.toFixed(1),
        x,
        gy - 4,
        {
          width: 38,
          align: "right"
        }
      );
  }

  // =====================================================
  // BAR
  // =====================================================

  const slotWidth =
    graphWidth /
    validItems.length;

  const barWidth =
    Math.min(
      55,
      slotWidth * 0.55
    );

  validItems.forEach(
    (item, index) => {

      const value =
        Number(item.value);

      const barHeight =
        Math.max(
          2,
          (value / safeMax) *
            chartHeight
        );

      const barX =
        graphLeft +
        index * slotWidth +
        (slotWidth - barWidth) / 2;

      const barY =
        graphBottom -
        barHeight;

      // Bar
      doc
        .roundedRect(
          barX,
          barY,
          barWidth,
          barHeight,
          4
        )
        .fill("#16836e");

      // Nilai
      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor("#123b4a")
        .text(
          `${value.toFixed(1)} ${item.unit || ""}`,
          barX - 15,
          barY - 14,
          {
            width: barWidth + 30,
            align: "center"
          }
        );

      // Label
      let label =
        item.label || "";

      // Pecah label panjang
      if (label.length > 18) {

        const words =
          label.split(" ");

        const lines = [];

        let current = "";

        words.forEach(word => {

          const test =
            current
              ? `${current} ${word}`
              : word;

          if (test.length > 18) {
            lines.push(current);
            current = word;
          } else {
            current = test;
          }
        });

        if (current) {
          lines.push(current);
        }

        label =
          lines.join("\n");
      }

      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#64777d")
        .text(
          label,
          barX - 20,
          graphBottom + 8,
          {
            width: barWidth + 40,
            align: "center",
            lineGap: 1
          }
        );
    }
  );

  // =====================================================
  // GARIS DASAR
  // =====================================================

  doc
    .moveTo(
      graphLeft,
      graphBottom
    )
    .lineTo(
      graphRight,
      graphBottom
    )
    .lineWidth(0.8)
    .strokeColor("#b9c9cc")
    .stroke();

  doc.y =
    graphBottom + 55;
}

app.get("/api/reports/pdf", async (req, res) => {
  try {
    const type = String(req.query.type || "weekly");
    const participantId = Number(req.query.participant_id);
    const month = String(req.query.month || "").trim();
    const week = Number(req.query.week || 1);

// =====================================================
// RAPOT INDIVIDU
// =====================================================
if (type === "weekly" || type === "monthly") {

  if (!participantId) {
    return res.status(400).json({
      error: "Peserta wajib dipilih."
    });
  }

  const participant = db.prepare(`
    SELECT *
    FROM participants
    WHERE id = ?
  `).get(participantId);

  if (!participant) {
    return res.status(404).json({
      error: "Peserta tidak ditemukan."
    });
  }

  const standard = standardFor(
    participant.age,
    participant.gender
  );

  let evaluations;

  // =====================================================
  // DATA UNTUK GRAFIK
  // =====================================================

  const chartEvaluations = db.prepare(`
    SELECT *
    FROM evaluations
    WHERE participant_id = ?
      AND month = ?
    ORDER BY week ASC, id ASC
  `).all(
    participantId,
    month
  );

  // =====================================================
  // DATA DETAIL RAPOT
  // =====================================================

  if (type === "weekly") {

    evaluations = db.prepare(`
      SELECT *
      FROM evaluations
      WHERE participant_id = ?
        AND month = ?
        AND week = ?
    `).all(
      participantId,
      month,
      week
    );

  } else {

    evaluations = db.prepare(`
      SELECT *
      FROM evaluations
      WHERE participant_id = ?
        AND month = ?
      ORDER BY week ASC, id ASC
    `).all(
      participantId,
      month
    );
  }

  if (!evaluations.length) {
    return res.status(404).json({
      error:
        "Belum ada data evaluasi pada periode tersebut."
    });
  }

  // Untuk rapot bulanan gunakan evaluasi minggu terakhir.
  // Untuk rapot mingguan gunakan minggu yang dipilih.
  const latestEvaluation =
    type === "weekly"
      ? evaluations[0]
      : evaluations[evaluations.length - 1];

  // =====================================================
  // PDF
  // =====================================================

  const doc = new PDFDocument({
    size: "A4",
    margin: 45,
    autoFirstPage: true
  });

  const safeName =
    participant.name
      .replace(/[^a-z0-9]/gi, "_");

  const safeMonth =
    month.replace(
      /[^a-z0-9]/gi,
      "_"
    );

  const filename =
    type === "weekly"
      ? `Rapot_Mingguan_${safeName}_${safeMonth}_Minggu_${week}.pdf`
      : `Rapot_Bulanan_${safeName}_${safeMonth}.pdf`;

  res.setHeader(
    "Content-Type",
    "application/pdf"
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );

  doc.pipe(res);

  // =====================================================
  // HEADER
  // =====================================================

  drawPdfHeader(
    doc,
    "RAPOT HASIL TEST SENAM",
    "Monitoring Evaluasi Peserta"
  );

  // =====================================================
  // IDENTITAS
  // =====================================================

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#123b4a")
    .text(
      "IDENTITAS PESERTA",
      45,
      doc.y
    );

  const identityTop =
    doc.y + 17;

  const identityWidth =
    doc.page.width - 90;

  doc
    .roundedRect(
      45,
      identityTop,
      identityWidth,
      67,
      7
    )
    .fill("#f8fbfa");

  doc
    .roundedRect(
      45,
      identityTop,
      identityWidth,
      67,
      7
    )
    .lineWidth(0.6)
    .strokeColor("#dce7e9")
    .stroke();

  // Nama
  doc
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor("#64777d")
    .text(
      "NAMA PESERTA",
      58,
      identityTop + 11
    );

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#123b4a")
    .text(
      participant.name,
      58,
      identityTop + 24
    );

  // Umur
  doc
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor("#64777d")
    .text(
      "UMUR",
      58,
      identityTop + 45
    );

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#123b4a")
    .text(
      `${participant.age} tahun`,
      58,
      identityTop + 57
    );

  // Gender
  doc
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor("#64777d")
    .text(
      "JENIS KELAMIN",
      250,
      identityTop + 11
    );

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#123b4a")
    .text(
      genderLabelPdf(
        participant.gender
      ),
      250,
      identityTop + 24
    );

  // Periode
  doc
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor("#64777d")
    .text(
      "PERIODE",
      400,
      identityTop + 11
    );

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#123b4a")
    .text(
      type === "weekly"
        ? `${month} — Minggu ${week}`
        : month,
      400,
      identityTop + 24
    );

  doc.y =
    identityTop + 83;

  // =====================================================
  // GRAFIK PERKEMBANGAN
  // =====================================================

  drawRapotTrendChart(
    doc,
    chartEvaluations.length
      ? chartEvaluations
      : evaluations,
    standard
  );

  // =====================================================
  // DETAIL HASIL
  // =====================================================

  drawEvaluationTable(
    doc,
    latestEvaluation,
    standard
  );

  // =====================================================
  // REKOMENDASI
  // =====================================================

  drawRapotRecommendation(
    doc,
    latestEvaluation,
    standard
  );

  // =====================================================
  // KESIMPULAN
  // =====================================================

  drawRapotConclusion(
    doc,
    latestEvaluation,
    standard
  );

  // =====================================================
  // FOOTER
  // =====================================================

  drawRapotFooter(doc);

  doc.end();

  return;
}

    // =====================================================
    // REKAP RATA-RATA SEMUA PESERTA
    // =====================================================

    if (type === "summary") {

      if (!month) {
        return res.status(400).json({
          error: "Bulan evaluasi wajib dipilih."
        });
      }

      const participants =
        db.prepare(`
          SELECT *
          FROM participants
          ORDER BY name COLLATE NOCASE ASC
        `).all();

      const evaluations =
        db.prepare(`
          SELECT
            e.*,
            p.name,
            p.age,
            p.gender
          FROM evaluations e
          JOIN participants p
            ON p.id = e.participant_id
          WHERE e.month = ?
          ORDER BY
            p.name COLLATE NOCASE ASC,
            e.week ASC
        `).all(month);

      if (!evaluations.length) {
        return res.status(404).json({
          error:
            "Belum ada data evaluasi pada bulan tersebut."
        });
      }

      // =====================================================
      // RATA-RATA
      // =====================================================

      const avg = key => {

        const values =
          evaluations
            .map(e => Number(e[key]))
            .filter(v => Number.isFinite(v));

        if (!values.length) {
          return null;
        }

        return values.reduce(
          (sum, value) => sum + value,
          0
        ) / values.length;
      };

      const avgGrip =
        evaluations
          .flatMap(e => [
            Number(e.grip_right),
            Number(e.grip_left)
          ])
          .filter(v => Number.isFinite(v));

      const averageGrip =
        avgGrip.length
          ? avgGrip.reduce(
              (sum, value) => sum + value,
              0
            ) / avgGrip.length
          : null;

      // =====================================================
      // LATEST PESERTA
      // =====================================================

      const latestByParticipant =
        new Map();

      evaluations.forEach(e => {

        const existing =
          latestByParticipant.get(
            e.participant_id
          );

        if (
          !existing ||
          e.week > existing.week
        ) {
          latestByParticipant.set(
            e.participant_id,
            e
          );
        }
      });

      let memenuhi = 0;
      let perhatian = 0;

      latestByParticipant.forEach(e => {

        const p =
          participants.find(
            item =>
              item.id === e.participant_id
          );

        if (!p) return;

        const standard =
          standardFor(
            p.age,
            p.gender
          );

        const classification =
          classify(
            e,
            standard
          );

        const values =
          Object.values(classification);

        if (
          values.length &&
          values.every(
            v =>
              v !== null &&
              v !== "perlu_ditingkatkan"
          )
        ) {
          memenuhi++;
        } else {
          perhatian++;
        }
      });

      // =====================================================
      // PDF
      // =====================================================

      const doc =
        new PDFDocument({
          size: "A4",
          margin: 45
        });

      const filename =
        `Rekap_RataRata_Senam_${month.replace(
          /[^a-z0-9]/gi,
          "_"
        )}.pdf`;

      res.setHeader(
        "Content-Type",
        "application/pdf"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      doc.pipe(res);

      // =====================================================
      // HEADER
      // =====================================================

      drawPdfHeader(
        doc,
        "REKAP RATA-RATA EVALUASI SENAM",
        `Periode: ${month}`
      );

      // =====================================================
      // RINGKASAN
      // =====================================================

      doc
        .fontSize(13)
        .font("Helvetica-Bold")
        .fillColor("#123b4a")
        .text("Ringkasan Evaluasi");

      doc.moveDown(0.5);

      const summaryX = 45;
      const summaryWidth =
        doc.page.width - 90;

      const summaryTop = doc.y;

      // Box ringkasan
      doc
        .roundedRect(
          summaryX,
          summaryTop,
          summaryWidth,
          80,
          7
        )
        .fill("#f5f9f8");

      doc
        .roundedRect(
          summaryX,
          summaryTop,
          summaryWidth,
          80,
          7
        )
        .lineWidth(0.7)
        .strokeColor("#dce7e9")
        .stroke();

      // Total
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#64777d")
        .text(
          "TOTAL PESERTA",
          summaryX + 15,
          summaryTop + 13
        );

      doc
        .font("Helvetica-Bold")
        .fontSize(15)
        .fillColor("#123b4a")
        .text(
          participants.length,
          summaryX + 15,
          summaryTop + 28
        );

      // Dievaluasi
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#64777d")
        .text(
          "DIEVALUASI",
          summaryX + 135,
          summaryTop + 13
        );

      doc
        .font("Helvetica-Bold")
        .fontSize(15)
        .fillColor("#123b4a")
        .text(
          latestByParticipant.size,
          summaryX + 135,
          summaryTop + 28
        );

      // Memenuhi
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#64777d")
        .text(
          "MEMENUHI STANDAR",
          summaryX + 260,
          summaryTop + 13
        );

      doc
        .font("Helvetica-Bold")
        .fontSize(15)
        .fillColor("#16836e")
        .text(
          memenuhi,
          summaryX + 260,
          summaryTop + 28
        );

      // Perhatian
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#64777d")
        .text(
          "PERLU PERHATIAN",
          summaryX + 390,
          summaryTop + 13
        );

      doc
        .font("Helvetica-Bold")
        .fontSize(15)
        .fillColor("#b77900")
        .text(
          perhatian,
          summaryX + 390,
          summaryTop + 28
        );

      doc.y =
        summaryTop + 98;

      // =====================================================
      // RATA-RATA
      // =====================================================

      doc
        .fontSize(13)
        .font("Helvetica-Bold")
        .fillColor("#123b4a")
        .text("Rata-rata Hasil Tes");

      doc.moveDown(0.5);

      drawEvaluationTable(
        doc,
        {
          sit_stand: avg("sit_stand"),
          one_leg: avg("one_leg"),
          toe_touch: avg("toe_touch"),
          grip_right: averageGrip,
          grip_left: null
        },
        null
      );

      // =====================================================
      // HALAMAN GRAFIK
      // =====================================================

      doc.addPage();

      drawPdfHeader(
        doc,
        "RINGKASAN VISUAL HASIL TES",
        `Periode: ${month}`
      );

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#64777d")
        .text(
          "Nilai berikut merupakan rata-rata hasil pengukuran pada periode yang dipilih."
        );

      doc.moveDown(1);

      // Grafik rata-rata sederhana
      drawPdfBarChart(
        doc,
        "Rata-rata Hasil Tes",
        [
          {
            label: "Duduk-Berdiri 10×",
            value: avg("sit_stand"),
            unit: "detik"
          },
          {
            label: "Berdiri 1 Kaki",
            value: avg("one_leg"),
            unit: "detik"
          },
          {
            label: "Jangkauan",
            value: avg("toe_touch"),
            unit: "cm"
          },
          {
            label: "Genggaman Tangan",
            value: averageGrip,
            unit: "kg"
          }
        ]
      );

      doc.moveDown(1);

      // =====================================================
      // DAFTAR PESERTA
      // =====================================================

      doc
        .fontSize(13)
        .font("Helvetica-Bold")
        .fillColor("#123b4a")
        .text("Rekap Peserta");

      doc.moveDown(0.5);

      latestByParticipant.forEach(e => {

        if (doc.y > 700) {
          doc.addPage();

          drawPdfHeader(
            doc,
            "REKAP PESERTA",
            `Periode: ${month}`
          );
        }

        const p =
          participants.find(
            item =>
              item.id === e.participant_id
          );

        if (!p) return;

        const standard =
          standardFor(
            p.age,
            p.gender
          );

        const classification =
          classify(
            e,
            standard
          );

        const needs =
          Object.values(classification)
            .some(
              v =>
                v === "perlu_ditingkatkan"
            );

        const rowTop = doc.y;

        doc
          .roundedRect(
            45,
            rowTop,
            doc.page.width - 90,
            28,
            5
          )
          .fill(
            needs
              ? "#fff8e8"
              : "#f1f8f6"
          );

        doc
          .font("Helvetica-Bold")
          .fontSize(8.5)
          .fillColor("#123b4a")
          .text(
            p.name,
            57,
            rowTop + 9,
            {
              width: 220
            }
          );

        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#64777d")
          .text(
            `${p.age} tahun`,
            280,
            rowTop + 9
          );

        doc
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor(
            needs
              ? "#b77900"
              : "#16836e"
          )
          .text(
            needs
              ? "Perlu perhatian"
              : "Memenuhi standar",
            380,
            rowTop + 9,
            {
              width: 145,
              align: "right"
            }
          );

        doc.y =
          rowTop + 36;
      });

      // =====================================================
      // KESIMPULAN
      // =====================================================

      if (doc.y > 650) {
        doc.addPage();

        drawPdfHeader(
          doc,
          "KESIMPULAN",
          `Periode: ${month}`
        );
      }

      doc.moveDown(0.5);

      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor("#123b4a")
        .text("Kesimpulan");

      doc.moveDown(0.3);

      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#344b54")
        .text(
          `Rekap bulan ${month} menunjukkan terdapat ${latestByParticipant.size} peserta yang memiliki data evaluasi. Hasil rata-rata dapat digunakan sebagai bahan monitoring perkembangan dan penyusunan latihan berikutnya.`,
          {
            width:
              doc.page.width - 90,
            lineGap: 3
          }
        );

      doc.end();

      return;
    }

    // =====================================================
    // JENIS LAPORAN TIDAK VALID
    // =====================================================

    return res.status(400).json({
      error: "Jenis laporan tidak valid."
    });

  } catch (e) {

    console.error(
      "REPORT ERROR:",
      e
    );

    if (!res.headersSent) {
      res.status(500).json({
        error: "Gagal membuat laporan PDF."
      });
    }
  }
});


app.use((req,res) => res.sendFile(path.join(__dirname,"../public/index.html")));

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Monitoring Senam berjalan di port ${PORT}`);
});
