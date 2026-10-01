import express from "express";
import Database from "better-sqlite3";
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
  return db.prepare(`
    SELECT * FROM evaluations WHERE participant_id = ?
    ORDER BY week DESC, id DESC LIMIT 1
  `).get(participantId) || null;
}

function decorateParticipant(p) {
  const latest = latestEvaluation(p.id);
  const standard = standardFor(p.age, p.gender);
  const classification = latest ? classify(latest, standard) : {sit_stand:null,one_leg:null,toe_touch:null,grip_right:null,grip_left:null};
  const recommendationData = latest ? recommendation(latest, standard) : {title:"Belum ada evaluasi",message:"Tambahkan evaluasi pertama untuk mendapatkan rekomendasi.",items:[]};
  const history = db.prepare(`SELECT * FROM evaluations WHERE participant_id = ? ORDER BY week ASC, id ASC`).all(p.id);
  const values = Object.values(classification);
  const complete = !!latest && values.every(v => v !== null);
  const needsAttention = values.some(v => v === "perlu_ditingkatkan");

  return {...p, latest_evaluation:latest, history, standard, classification, recommendation:recommendationData, complete, needs_attention:needsAttention};
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

app.use((req,res) => res.sendFile(path.join(__dirname,"../public/index.html")));

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Monitoring Senam berjalan di port ${PORT}`);
});
