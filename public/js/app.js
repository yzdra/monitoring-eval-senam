
let participants = [];
let standards = [];
let charts = [];

let movementChart = null;
let currentMovement = 'all';
let currentDetailId = null;

const movementVisuals = {

  all: {
    title: 'Gerakan Evaluasi',
    badge: 'Evaluasi',
    icon: '🏃',
    text: 'Pilih jenis gerakan pada grafik untuk melihat keterangannya.',
    rule: 'Empat jenis gerakan digunakan dalam evaluasi senam.'
  },

  sit_stand: {
    title: 'Duduk-Berdiri 10×',
    badge: 'Kekuatan',
    image: '/assets/img/gerakan/duduk-berdiri.png',
    rule: 'Tes dilakukan sebanyak 10 kali. Waktu yang lebih rendah menunjukkan hasil yang lebih baik.'
  },

  one_leg: {
    title: 'Berdiri 1 Kaki',
    badge: 'Keseimbangan',
    image: '/assets/img/gerakan/berdiri-satu-kaki.png',
    rule: 'Durasi berdiri yang lebih tinggi menunjukkan kemampuan keseimbangan yang lebih baik.'
  },

  toe_touch: {
    title: 'Jangkauan / Membungkuk',
    badge: 'Fleksibilitas',
    image: '/assets/img/gerakan/jangkauan.png',
    rule: 'Nilai jangkauan yang lebih tinggi menunjukkan fleksibilitas yang lebih baik.'
  },

  grip: {
    title: 'Genggaman Tangan',
    badge: 'Kekuatan',
    image: '/assets/img/gerakan/genggaman.png',
    rule: 'Nilai genggaman dalam kg yang lebih tinggi menunjukkan kekuatan genggaman yang lebih baik.'
  }

};

const $ = id => document.getElementById(id);

const esc = v =>
  String(v ?? '').replace(/[&<>'"]/g, c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    "'":'&#039;',
    '"':'&quot;'
  }[c]));

const fmt = v =>
  v === null || v === undefined || v === ''
    ? '-'
    : (Number.isFinite(Number(v))
      ? Number(v).toFixed(1).replace('.0','')
      : esc(v));

const genderLabel = g =>
  g === 'pria' ? 'Pria' :
  g === 'wanita' ? 'Wanita' : '-';

function toast(msg){

  $('toast').textContent = msg;

  $('toast').classList.add('show');

  setTimeout(() => {
    $('toast').classList.remove('show');
  },2200);

}

function renderMovementPhoto(movement = currentMovement){

  const data =
    movementVisuals[movement] ||
    movementVisuals.all;

  const container =
    $('movementPhotoImage');

  const title =
    $('movementPhotoTitle');

  const text =
    $('movementPhotoText');

  const name =
    $('movementPhotoName');

  const rule =
    $('movementPhotoRule');

  const badge =
    $('movementPhotoBadge');

  if(!container) return;

  if(badge){
    badge.textContent =
      data.badge || 'Evaluasi';
  }

  if(title){
    title.textContent =
      data.title;
  }

  if(name){
    name.textContent =
      data.title;
  }

  if(rule){
    rule.textContent =
      data.rule;
  }

  if(data.image){

    container.innerHTML = `
      <img
        class="movement-photo-image-real"
        src="${data.image}"
        alt="${esc(data.title)}"
        onerror="this.parentElement.innerHTML =
          '<div class=&quot;movement-photo-placeholder&quot;>' +
          '<div class=&quot;photo-icon&quot;>🏃</div>' +
          '<strong>Foto belum tersedia</strong>' +
          '<span>Tambahkan foto pada folder assets/img/gerakan.</span>' +
          '</div>'"
      >
    `;

  }else{

    container.innerHTML = `
      <div class="movement-photo-placeholder">

        <div class="photo-icon">
          ${data.icon || '🏃'}
        </div>

        <strong>
          ${esc(data.title)}
        </strong>

        <span>
          ${esc(data.text)}
        </span>

      </div>
    `;

  }

}

function closeModal(id){

  const modal = $(id);

  if(!modal) return;

  modal.classList.remove('show');

  if(id === 'detailModal'){
    destroyCharts();
  }

}

function closeDetail(showParticipantList = true){
  currentDetailId = null;
  destroyCharts();
  const detailModal = $('detailModal');
  if(detailModal){
    detailModal.classList.remove('show');
  }
  if(showParticipantList){
    const participantModal =
      $('participantListModal');
    if(participantModal){
      participantModal.classList.remove('show');
      renderParticipantPage();
      participantModal.classList.add('show');
    }
  }
}

async function api(url,opts={}){

  const r = await fetch(url,{
    ...opts,
    headers:{
      'Content-Type':'application/json',
      ...(opts.headers || {})
    }
  });

  const d = await r.json().catch(() => ({}));

  if(!r.ok){
    throw new Error(d.error || 'Terjadi kesalahan');
  }

  return d;

}

function status(v){

  if(v === 'bagus_sekali')
    return ['Bagus sekali','badge-good','good'];

  if(v === 'standar' || v === 'memenuhi')
    return ['Memenuhi standar','badge-good','good'];

  if(v === 'perlu_ditingkatkan')
    return ['Perlu ditingkatkan','badge-bad','bad'];

  return ['Belum dinilai','badge-neutral','neutral'];

}

function statusBadge(v){

  const s = status(v);

  return `
    <span class="badge ${s[1]}">
      ${s[0]}
    </span>
  `;

}

function participantProgress(p){

  const c = p.classification || {};

  const tests = [
    c.sit_stand,
    c.one_leg,
    c.toe_touch,
    c.grip_right,
    c.grip_left
  ];

  const available = tests.filter(v => v !== null && v !== undefined);

  if(!available.length){
    return 0;
  }

  const passed = available.filter(v =>
    v === 'bagus_sekali' ||
    v === 'standar' ||
    v === 'memenuhi'
  ).length;

  return Math.round((passed / 5) * 100);

}

function progressBar(p){

  const value = participantProgress(p);

  return `
    <div class="progress-mini">
      <div class="progress-mini-head">
        <span>${value}%</span>
      </div>

      <div class="progress-track">
        <div
          class="progress-fill"
          style="width:${value}%">
        </div>
      </div>
    </div>
  `;

}

function renderStats(){

  const total = participants.length;

  const good = participants.filter(
    p => p.complete && !p.needs_attention
  ).length;

  const attention = participants.filter(
    p => p.needs_attention
  ).length;

  const progressValues = participants.map(
    participantProgress
  );

  const averageProgress = progressValues.length
    ? Math.round(
        progressValues.reduce((a,b) => a+b,0) /
        progressValues.length
      )
    : 0;

  $('statParticipants').textContent = total;
  $('statGood').textContent = good;
  $('statAttention').textContent = attention;

  $('statProgress').textContent =
    `${averageProgress}% rata-rata progres`;

  const success = total
    ? Math.round((good / total) * 100)
    : 0;

  $('statSuccess').textContent = `${success}%`;

  $('summaryParticipants').textContent = total;
  $('summaryGood').textContent = good;
  $('summaryAttention').textContent = attention;
  $('summarySuccess').textContent = `${success}%`;
  $('summaryProgressFill').style.width = `${success}%`;

}

function getMonthKey(value){

  return String(value || '')
    .trim()
    .toLowerCase();

}

function getAllMonths(){

  const months = [];

  participants.forEach(p => {

    (p.history || []).forEach(e => {

      if(e.month && !months.includes(e.month)){
        months.push(e.month);
      }

    });

  });

  return months;

}

function destroyCharts(){

  charts.forEach(c => c.destroy());

  charts = [];

}

function getMonthlyEvaluations(month){

  const rows = [];

  participants.forEach(p => {

    const history = p.history || [];

    const filtered = history.filter(e =>
      getMonthKey(e.month) === getMonthKey(month)
    );

    if(!filtered.length) return;

    filtered.sort((a,b) =>
      Number(a.week || 0) - Number(b.week || 0) ||
      Number(a.id || 0) - Number(b.id || 0)
    );

    rows.push({
      participant:p,
      evaluation:filtered[filtered.length - 1]
    });

  });

  return rows;

}

function average(values){

  const numbers = values
    .map(Number)
    .filter(v => Number.isFinite(v));

  if(!numbers.length) return 0;

  return numbers.reduce((a,b) => a+b,0) /
         numbers.length;

}

function normalizeScore(value,min,max){

  if(!Number.isFinite(value)){
    return 0;
  }

  if(max === min){
    return 50;
  }

  return Math.max(
    0,
    Math.min(
      100,
      ((value - min) / (max - min)) * 100
    )
  );

}

function renderMonthlySpider(){
  const canvas = $('monthlySpiderChart');
  if(!canvas) return;

  charts.forEach(c => c.destroy());
  charts = [];

  let month = $('chartMonth')?.value || 'latest';
  const months = getAllMonths();
  if(month === 'latest') month = months.at(-1) || '';

  const rows = [];
  const uniqueParticipants = new Set();

  participants.forEach(p => {
    const history = (p.history || [])
      .filter(e => getMonthKey(e.month) === getMonthKey(month))
      .reduce((map,e) => {
        const week = Number(e.week || 0);
        if(!week) return map;
        if(!map[week] || Number(e.id || 0) > Number(map[week].id || 0)) map[week] = e;
        return map;
      }, {});

    Object.values(history).forEach(e => {
      rows.push({participant:p, evaluation:e});
      if(p.id !== undefined) uniqueParticipants.add(p.id);
    });
  });

  $('chartParticipantCount').textContent = uniqueParticipants.size;
  $('chartEvaluationCount').textContent = rows.length;

  const scores = {sit:[], one:[], toe:[], grip:[]};
  const ages = participants
    .map(p => Number(p.age))
    .filter(Number.isFinite);

  rows.forEach(({participant:p, evaluation:e}) => {
    const s = p.standard;
    if(!s) return;

    if(e.sit_stand !== null && e.sit_stand !== undefined){
      const value = Number(e.sit_stand);
      const min = Number(s.sit_fast_max);
      const max = Number(s.sit_slow_min);
      if(Number.isFinite(value) && Number.isFinite(min) && Number.isFinite(max)){
        scores.sit.push(100 - normalizeScore(value,min,max));
      }
    }

    if(e.one_leg !== null && e.one_leg !== undefined){
      const value = Number(e.one_leg);
      const min = Number(s.one_normal_min);
      const max = Number(s.one_good_min);
      if(Number.isFinite(value) && Number.isFinite(min) && Number.isFinite(max)){
        scores.one.push(normalizeScore(value,min,max));
      }
    }

    if(e.toe_touch !== null && e.toe_touch !== undefined){
      const value = Number(e.toe_touch);
      const target = Number(s.toe_touch_standard);
      if(Number.isFinite(value) && Number.isFinite(target) && target > 0){
        scores.toe.push(Math.min(100,(value / target) * 100));
      }
    }

    const grips = [Number(e.grip_right),Number(e.grip_left)]
      .filter(Number.isFinite);
    const gripStandard = Number(s.grip_standard);
    if(grips.length && Number.isFinite(gripStandard) && gripStandard > 0){
      const averageGrip = grips.reduce((a,b) => a+b,0) / grips.length;
      scores.grip.push(Math.min(100,(averageGrip / gripStandard) * 100));
    }
  });

  const evaluationValues = [
    Math.round(average(scores.sit)),
    Math.round(average(scores.one)),
    Math.round(average(scores.toe)),
    Math.round(average(scores.grip))
  ].map(v => Number.isFinite(v) ? v : 0);

  const averageAge = ages.length
    ? (ages.reduce((a,b) => a+b,0) / ages.length).toFixed(1).replace('.0','')
    : '-';

  $('chartTitle').textContent = 'Perbandingan Standar & Hasil Evaluasi';
  $('chartDescription').textContent =
    `Standar keberhasilan berdasarkan usia peserta (rata-rata umur ${averageAge} tahun) dibandingkan dengan rata-rata hasil evaluasi.`;

  const ctx = canvas.getContext('2d');

  charts.push(new Chart(ctx,{
    type:'bar',
    data:{
      labels:['Duduk-Berdiri','Keseimbangan','Fleksibilitas','Genggaman'],
      datasets:[
        {
          label:'Standar Keberhasilan',
          data:[100,100,100,100],
          backgroundColor:'rgba(15,118,110,0.18)',
          borderColor:'#0f766e',
          borderWidth:1.5,
          borderRadius:6,
          maxBarThickness:30
        },
        {
          label:'Hasil Evaluasi',
          data:evaluationValues,
          backgroundColor:'rgba(37,99,235,0.72)',
          borderColor:'#2563eb',
          borderWidth:1.5,
          borderRadius:6,
          maxBarThickness:30
        }
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:{duration:500},
      interaction:{intersect:false,mode:'index'},
      plugins:{
        legend:{
          display:true,
          position:'top',
          align:'start',
          labels:{
            boxWidth:9,
            boxHeight:9,
            usePointStyle:true,
            padding:12,
            font:{family:'Plus Jakarta Sans',size:9,weight:'600'}
          }
        },
        tooltip:{
          padding:8,
          titleFont:{family:'Plus Jakarta Sans',size:10,weight:'700'},
          bodyFont:{family:'Plus Jakarta Sans',size:10},
          callbacks:{
            label:context => ` ${context.dataset.label}: ${context.raw}%`
          }
        }
      },
      scales:{
        x:{
          grid:{display:false},
          ticks:{font:{family:'Plus Jakarta Sans',size:9,weight:'600'}}
        },
        y:{
          beginAtZero:true,
          min:0,
          max:100,
          ticks:{
            stepSize:20,
            callback:value => `${value}%`,
            font:{family:'Plus Jakarta Sans',size:9}
          },
          grid:{color:'rgba(148,163,184,0.16)'}
        }
      }
    }
  }));
}

function showMovementChart(movement){

  currentMovement = movement;

  renderMovementPhoto(movement);

  const spiderWrapper = $('spiderChartWrapper');
  const movementWrapper = $('movementChartWrapper');

  if(!spiderWrapper || !movementWrapper) return;

  if(movement === 'all'){

    spiderWrapper.style.display = 'flex';

    movementWrapper.style.display = 'none';

    $('chartTitle').textContent =
      'Rata-rata Hasil Gerakan';

    $('chartDescription').textContent =
      'Profil rata-rata seluruh peserta pada periode yang dipilih.';

    renderMonthlySpider();

    return;

  }

  spiderWrapper.style.display = 'none';

  movementWrapper.style.display = 'block';

  const titles = {

    sit_stand: 'Duduk-Berdiri',

    one_leg: '1 Kaki',

    toe_touch: 'Jangkauan',

    grip: 'Genggaman'

  };

  $('chartTitle').textContent =
    `Perkembangan ${titles[movement] || 'Gerakan'}`;

  $('chartDescription').textContent =
    'Perkembangan hasil evaluasi berdasarkan minggu.';

  renderMovementProgress();

}

function renderMovementProgress(){

  const canvas = $('movementProgressChart');
  if(!canvas) return;
  if(movementChart){
    movementChart.destroy();
    movementChart = null;
  }

  let selectedMonth =
    $('chartMonth')?.value || 'latest';
  const months = getAllMonths();
  if(selectedMonth === 'latest'){
    selectedMonth =
      months.length
        ? months[months.length - 1]
        : '';
  }

  const rows = [];
  participants.forEach(p => {
    (p.history || []).forEach(e => {
      if(
        selectedMonth &&
        getMonthKey(e.month) !==
        getMonthKey(selectedMonth)
      ){
        return;
      }
      rows.push({
        participant:p,
        evaluation:e
      });

    });

  });

  const uniqueParticipants =
    new Set(
      rows.map(x => x.participant.id)
    );
  $('chartParticipantCount').textContent =
    uniqueParticipants.size;
  $('chartEvaluationCount').textContent =
    rows.length;

  if(!rows.length){
    const ctx =
      canvas.getContext('2d');
    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );
    return;
  }

  const weeklyData = {};
  rows.forEach(x => {
    const week =
      Number(x.evaluation.week || 0);
    if(!weeklyData[week]){
      weeklyData[week] = [];
    }
    weeklyData[week].push(x.evaluation);
  });
  const weeks =
    Object.keys(weeklyData)
      .map(Number)
      .sort((a,b) => a - b);
  const labels =
    weeks.map(
      week => `M${week}`
    );

  const weeklyAverage = (week, field) => {
    const values =
      weeklyData[week]
        .map(e => Number(e[field]))
        .filter(v => Number.isFinite(v));
    if(!values.length) return null;
    return values.reduce(
      (sum, value) => sum + value,
      0
    ) / values.length;
  };
  let datasets = [];

  if(currentMovement === 'sit_stand'){
    datasets = [
      {
        label:'Duduk-Berdiri',
        data:weeks.map(
          week =>
            weeklyAverage(
              week,
              'sit_stand'
            )
        ),
        borderWidth:2,
        pointRadius:4,
        tension:.3,
        spanGaps:true
      }
    ];
  }

  else if(currentMovement === 'one_leg'){
    datasets = [
      {
        label:'1 Kaki',
        data:weeks.map(
          week =>
            weeklyAverage(
              week,
              'one_leg'
            )
        ),
        borderWidth:2,
        pointRadius:4,
        tension:.3,
        spanGaps:true
      }
    ];
  }

  else if(currentMovement === 'toe_touch'){
    datasets = [
      {
        label:'Jangkauan',
        data:weeks.map(
          week =>
            weeklyAverage(
              week,
              'toe_touch'
            )
        ),
        borderWidth:2,
        pointRadius:4,
        tension:.3,
        spanGaps:true
      }
    ];
  }

  else if(currentMovement === 'grip'){
    datasets = [
      {
        label:'Grip Kanan',
        data:weeks.map(
          week =>
            weeklyAverage(
              week,
              'grip_right'
            )
        ),
        borderWidth:2,
        pointRadius:4,
        tension:.3,
        spanGaps:true
      },
      {
        label:'Grip Kiri',
        data:weeks.map(
          week =>
            weeklyAverage(
              week,
              'grip_left'
            )
        ),
        borderWidth:2,
        pointRadius:4,
        tension:.3,
        spanGaps:true
      }
    ];
  }

  movementChart =
    new Chart(
      canvas,
      {
        type:'line',
        data:{
          labels:labels,
          datasets:datasets
        },
        options:{
          responsive:true,
          maintainAspectRatio:false,
          interaction:{
            intersect:false,
            mode:'index'
          },

          plugins:{
            legend:{
              display:
                currentMovement === 'grip',
              position:'top',
              align:'start',
              labels:{
                boxWidth:9,
                boxHeight:9,
                usePointStyle:true,
                padding:12,
                font:{
                  size:9
                }
              }
            },

            tooltip:{
              padding:8,
              titleFont:{
                size:10
              },
              bodyFont:{
                size:10
              },
              callbacks:{
                label:function(context){
                  return `${context.dataset.label}: ${Number(context.raw).toFixed(1)}`;
                }
              }
            }
          },

          scales:{
            x:{
              grid:{
                display:false
              },
              ticks:{
                font:{
                  size:9
                }
              }
            },
            y:{
              beginAtZero:false,
              ticks:{
                font:{
                  size:9
                }
              }
            }
          }
        }
      }
    );
}

function renderDashboardCharts(){

  if(currentMovement === 'all'){

    renderMonthlySpider();

  }else{

    renderMovementProgress();

  }

}

function renderMonthFilter(){

  const select = $('chartMonth');

  if(!select) return;

  const months = getAllMonths();

  select.innerHTML =
    `<option value="latest">Bulan terbaru</option>` +
    months.map(m =>
      `<option value="${esc(m)}">${esc(m)}</option>`
    ).join('');

}

let currentStatType = 'participants';

function openStatModal(type){

  currentStatType = type;

  $('statSearch').value = '';
  $('statFilter').value = 'all';

  if(type === 'participants'){

    $('statModalTitle').textContent =
      'Total Peserta';

    $('statModalDescription').textContent =
      'Daftar seluruh peserta beserta progres evaluasi.';

  }

  if(type === 'good'){

    $('statModalTitle').textContent =
      'Peserta Memenuhi Semua Tes';

    $('statModalDescription').textContent =
      'Peserta yang seluruh hasil evaluasi terbarunya memenuhi standar.';

    $('statFilter').value = 'good';

  }

  if(type === 'attention'){

    $('statModalTitle').textContent =
      'Peserta Perlu Perhatian';

    $('statModalDescription').textContent =
      'Peserta yang masih memiliki hasil di bawah standar.';

    $('statFilter').value = 'attention';

  }

  $('statModal').classList.add('show');

  renderStatModal();

}

function renderStatModal(){

  const q =
    $('statSearch').value
      .trim()
      .toLowerCase();

  const filter =
    $('statFilter').value;

  let rows = participants.filter(p =>
    p.name.toLowerCase().includes(q)
  );

  if(currentStatType === 'good'){
    rows = rows.filter(
      p => p.complete && !p.needs_attention
    );
  }

  if(currentStatType === 'attention'){
    rows = rows.filter(
      p => p.needs_attention
    );
  }

  if(filter === 'good'){
    rows = rows.filter(
      p => p.complete && !p.needs_attention
    );
  }

  if(filter === 'attention'){
    rows = rows.filter(
      p => p.needs_attention
    );
  }

  if(filter === 'incomplete'){
    rows = rows.filter(
      p => !p.complete
    );
  }

  $('statModalContent').innerHTML = rows.length

    ? rows.map(p => {

        const e = p.latest_evaluation;

        const progress =
          participantProgress(p);

        const statusText =
          !e
            ? 'Belum ada evaluasi'
            : p.needs_attention
              ? 'Perlu perhatian'
              : p.complete
                ? 'Memenuhi standar'
                : 'Belum lengkap';

        const cls =
          p.needs_attention
            ? 'badge-warn'
            : p.complete
              ? 'badge-good'
              : 'badge-neutral';

        return `
          <div class="participant-summary">

            <div class="participant-summary-main">

              <div class="participant-summary-name">
                <b>${esc(p.name)}</b>

                <span class="badge ${cls}">
                  ${statusText}
                </span>
              </div>

              <div class="participant-summary-meta">
                ${p.age} tahun · ${genderLabel(p.gender)}
                ${e ? ` · M${e.week} · ${esc(e.month || '-')}` : ''}
              </div>

              ${progressBar(p)}

            </div>

            <div class="participant-summary-actions">

              <button
                class="btn btn-primary btn-small"
                onclick="closeModal('statModal');openDetail(${p.id})">
                Detail
              </button>

            </div>

          </div>
        `;

      }).join('')

    : `
      <div class="empty">
        Tidak ada peserta yang sesuai.
      </div>
    `;

}

function openParticipantList(){

  $('participantListModal').classList.add('show');

  renderParticipantPage();

}

function renderParticipantPage(){

  const q =
    $('participantPageSearch').value
      .trim()
      .toLowerCase();

  const filter =
    $('participantPageFilter').value;

  let rows = participants.filter(p =>
    p.name.toLowerCase().includes(q)
  );

  if(filter === 'good'){

    rows = rows.filter(
      p => p.complete && !p.needs_attention
    );

  }

  if(filter === 'attention'){

    rows = rows.filter(
      p => p.needs_attention
    );

  }

  if(filter === 'incomplete'){

    rows = rows.filter(
      p => !p.complete
    );

  }

  $('participantPageRows').innerHTML = rows.length

    ? rows.map(p => {

        const e = p.latest_evaluation;

        const progress =
          participantProgress(p);

        const statusText =
          !e
            ? 'Belum ada evaluasi'
            : p.needs_attention
              ? 'Perlu perhatian'
              : p.complete
                ? 'Memenuhi standar'
                : 'Belum lengkap';

        const cls =
          p.needs_attention
            ? 'badge-warn'
            : p.complete
              ? 'badge-good'
              : 'badge-neutral';

        return `
          <tr>

            <td class="name-cell">
              <b>${esc(p.name)}</b>
              <span>
                ${genderLabel(p.gender)}
              </span>
            </td>

            <td>${p.age}</td>

            <td style="min-width:130px">
              ${progressBar(p)}
            </td>

            <td>
              ${
                e
                  ? `M${e.week} · ${esc(e.month || '-')}`
                  : '-'
              }
            </td>

            <td>
              <span class="badge ${cls}">
                ${statusText}
              </span>
            </td>

            <td>

              <button
                class="btn btn-primary btn-small"
                onclick="closeModal('participantListModal');openDetail(${p.id})">
                Detail
              </button>

            </td>

          </tr>
        `;

      }).join('')

    : `
      <tr>
        <td colspan="6" class="empty">
          Tidak ada peserta.
        </td>
      </tr>
    `;

}

function renderStandards(){

  const make = g =>
    standards
      .filter(s => s.gender === g)
      .map(s => `
        <tr>

          <td>
            ${s.age_min}–${s.age_max}
          </td>

          <td>
            ≤${fmt(s.sit_fast_max)}
            /
            ${fmt(s.sit_normal_min)}–${fmt(s.sit_normal_max)}
            /
            ≥${fmt(s.sit_slow_min)}
          </td>

          <td>
            ≤${fmt(s.one_low_max)}
            /
            ${fmt(s.one_normal_min)}–${fmt(s.one_normal_max)}
            /
            ≥${fmt(s.one_good_min)}
          </td>

          <td>
            ≥${fmt(s.toe_touch_standard)}
          </td>

          <td>
            ${
              s.grip_standard === null
                ? '-'
                : '≥' + fmt(s.grip_standard)
            }
          </td>

        </tr>
      `)
      .join('');

  $('standardMale').innerHTML =
    make('pria');

  $('standardFemale').innerHTML =
    make('wanita');

}

function openStandardModal(){

  $('standardModal').classList.add('show');

}

function getExerciseGroups(){

  return [

    [
      'Peregangan',
      [
        'peregangan putaran pinggang',
        'peregangan betis',
        'latihan ekstensi kaki',
        'latihan membungkuk ke depan',
        'Peregangan satu kaki sambil berdiri',
        'Silang berdiri membungkuk ke depan'
      ]
    ],

    [
      'Latihan otot',
      [
        'pelatihan angkat kaki',
        'latihan sepak terjang',
        'Pelatihan kekuatan inti',
        'pelatihan jongkok',
        'Latihan gooper (memperkuat kekuatan genggaman)'
      ]
    ]

  ];

}

function renderMenu(){
  const groups = getExerciseGroups();
  $('menuModalList').innerHTML = groups.map(
    g => `
      <div class="menu-group">
        <div class="menu-group-head">
          <div class="menu-group-icon">
            🤸
          </div>
          <div>
            <h4>${esc(g[0])}</h4>
            <span>${g[1].length} jenis latihan</span>
          </div>
        </div>
        <div class="menu-tags">
          ${g[1].map((x, index) => `
            <div class="menu-exercise">
              <span class="menu-exercise-number">
                ${index + 1}
              </span>
              <span class="menu-exercise-name">
                ${esc(x)}
              </span>
            </div>
          `).join('')}
        </div>
      </div>
    `
  ).join('');
}

function openMenuModal(){

  renderMenu();
  $('menuModal').classList.add('show');

}

function openReportModal(){

  const modal = $('reportModal');

  if(!modal) return;

  renderReportParticipants();
  renderReportMonths();
  changeReportType();

  modal.classList.add('show');

}

function renderReportParticipants(){

  const select =
    $('reportParticipant');

  if(!select) return;

  select.innerHTML = `
    <option value="">
      Pilih peserta
    </option>

    ${participants.map(p => `
      <option value="${p.id}">
        ${esc(p.name)}
      </option>
    `).join('')}
  `;

}
function renderReportMonths(){

  const select =
    $('reportMonth');

  if(!select) return;

  const months =
    getAllMonths();

  select.innerHTML = `
    <option value="">
      Pilih bulan
    </option>

    ${months.map(month => `
      <option value="${esc(month)}">
        ${esc(month)}
      </option>
    `).join('')}
  `;

}

function changeReportType(){

  const type =
    $('reportType')?.value;

  const participantField =
    $('reportParticipantField');

  const weekField =
    $('reportWeekField');

  if(type === 'summary'){

    if(participantField){
      participantField.style.display = 'none';
    }

    if(weekField){
      weekField.style.display = 'none';
    }

  }else{

    if(participantField){
      participantField.style.display = '';
    }

    if(weekField){
      weekField.style.display =
        type === 'weekly'
          ? ''
          : 'none';
    }

  }

  const preview =
    $('reportPreview');

  if(preview){

    preview.innerHTML = `
      <div class="report-preview-icon">
        📋
      </div>

      <h4>
        ${
          type === 'weekly'
            ? 'Rapot Mingguan'
            : type === 'monthly'
              ? 'Rapot Bulanan'
              : 'Rekap Rata-rata Peserta'
        }
      </h4>

      <p>
        ${
          type === 'weekly'
            ? 'Rapot hasil evaluasi peserta pada satu minggu.'
            : type === 'monthly'
              ? 'Rapot perkembangan peserta selama satu bulan.'
              : 'Rekap rata-rata hasil evaluasi seluruh peserta.'
        }
      </p>
    `;

  }

}

async function downloadReport(){

  const type =
    $('reportType')?.value;

  const participant =
    $('reportParticipant')?.value;

  const month =
    $('reportMonth')?.value;

  const week =
    $('reportWeek')?.value;

  if(type !== 'summary' && !participant){

    toast('Pilih peserta terlebih dahulu.');

    return;

  }

  if(!month){

    toast('Pilih bulan evaluasi terlebih dahulu.');

    return;

  }

  if(type === 'weekly' && !week){

    toast('Pilih minggu evaluasi.');

    return;

  }

  try{

    toast('Membuat rapot...');

    const params =
      new URLSearchParams();

    params.set('type',type);
    params.set('month',month);

    if(participant){
      params.set(
        'participant_id',
        participant
      );
    }

    if(type === 'weekly'){
      params.set('week',week);
    }

    const response =
      await fetch(
        `/api/reports/pdf?${params.toString()}`
      );

    if(!response.ok){

      const data =
        await response.json()
          .catch(() => ({}));

      throw new Error(
        data.error ||
        'Gagal membuat rapot.'
      );

    }

    const blob =
      await response.blob();

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement('a');

    a.href = url;

    a.download =
      type === 'weekly'
        ? 'Rapot_Mingguan.pdf'
        : type === 'monthly'
          ? 'Rapot_Bulanan.pdf'
          : 'Rekap_RataRata_Senam.pdf';

    document.body.appendChild(a);

    a.click();

    a.remove();

    URL.revokeObjectURL(url);

    toast('Rapot berhasil didownload.');

  }catch(error){

    console.error(error);

    toast(error.message);

  }

}

function openParticipantChoice(){

  $('participantChoiceModal').classList.add('show');

}

function resetParticipantForm(){

  $('participantForm').reset();

  $('participantId').value = '';

  $('participantModalTitle').textContent =
    'Tambah Peserta';

  $('week').value = 1;

  document
    .querySelectorAll('#participantForm .field')
    .forEach(field => {
      field.style.display = '';
    });

}

function openManualParticipant(){

  closeModal('participantChoiceModal');

  resetParticipantForm();

  $('participantModal').classList.add('show');

}

function openExcelImport(){

  closeModal('participantChoiceModal');

  $('excelModal').classList.add('show');

}

async function uploadExcel(){

  const file =
    $('excelFile').files[0];

  if(!file){

    toast('Pilih file Excel terlebih dahulu.');

    return;

  }

  toast(
    'File sudah dipilih. Endpoint import Excel belum diaktifkan.'
  );

}

$('participantForm').addEventListener(
  'submit',
  async e => {

    e.preventDefault();

    const id =
      $('participantId').value;

    const body = {

      name:$('name').value,

      age:$('age').value,

      gender:$('gender').value,

      month:$('month').value,

      week:$('week').value,

      sit_stand:$('sit_stand').value,

      one_leg:$('one_leg').value,

      toe_touch:$('toe_touch').value,

      grip_right:$('grip_right').value,

      grip_left:$('grip_left').value

    };

    try{

      await api(
        id
          ? `/api/participants/${id}`
          : '/api/participants',
        {
          method:id ? 'PUT' : 'POST',
          body:JSON.stringify(body)
        }
      );

      closeModal('participantModal');

      await refreshAll();

      if(id && currentDetailId === Number(id)){

        openDetail(Number(id));

      }

      toast(
        id
          ? 'Peserta diperbarui'
          : 'Peserta ditambahkan'
      );

    }catch(err){

      toast(err.message);

    }

  }
);

function scoreCard(label,val){

  const s = status(val);

  return `
    <div class="score ${s[2]}">
      <small>${label}</small>
      <b>${s[0]}</b>
    </div>
  `;

}

function openDetail(id){

  const p =
    participants.find(x => x.id === id);

  if(!p) return;

  currentDetailId = id;

  destroyCharts();

  $('detailName').textContent =
    p.name;

  $('detailMeta').textContent =
    `${p.age} tahun · ${genderLabel(p.gender)} · ${p.history.length} evaluasi`;

  const c = p.classification;
  const r = p.recommendation;
  const e = p.latest_evaluation;

  $('detailContent').innerHTML = `
    <div class="detail-cover">
      <div class="detail-cover-icon">👤</div>
      <div class="detail-cover-text">
        <strong>${esc(p.name)}</strong>
        <span>${p.age} tahun · ${genderLabel(p.gender)}</span>
      </div>
    </div>

    <div class="detail-actions">

      <button
        class="btn btn-primary btn-small"
        onclick="openEvaluationForm(${p.id})">
        ＋ Tambah Evaluasi
      </button>

      <button
        class="btn btn-soft btn-small"
        onclick="editParticipant(${p.id})">
        ✏️ Edit Peserta
      </button>

      <button
        class="btn btn-danger btn-small"
        onclick="deleteParticipant(${p.id})">
        🗑️ Hapus Peserta
      </button>

    </div>

    <div class="detail-top">

      <div class="score-grid">

        ${scoreCard(
          'Duduk-Berdiri',
          c.sit_stand
        )}

        ${scoreCard(
          '1 Kaki',
          c.one_leg
        )}

        ${scoreCard(
          'Jangkauan',
          c.toe_touch
        )}

        ${scoreCard(
          'Grip Kanan',
          c.grip_right
        )}

        ${scoreCard(
          'Grip Kiri',
          c.grip_left
        )}

      </div>

      <div class="detail-progress-box">

        <div>
          <span>Progress peserta</span>
          <b>${participantProgress(p)}%</b>
        </div>

        <div class="progress-track">
          <div
            class="progress-fill"
            style="width:${participantProgress(p)}%">
          </div>
        </div>

      </div>

    </div>

    <div class="detail-note">

      Evaluasi terbaru:
      <b>
        ${
          e
            ? `Minggu ${e.week} · ${esc(e.month || '-')}`
            : 'belum ada'
        }
      </b>

    </div>

    <h4 style="margin:18px 0 8px">
      Grafik peningkatan mingguan
    </h4>

    <div class="chart-grid">

      <div class="chart-card">
        <h4>Duduk-Berdiri 10×</h4>
        <canvas id="chartSit"></canvas>
      </div>

      <div class="chart-card">
        <h4>Berdiri 1 Kaki</h4>
        <canvas id="chartOne"></canvas>
      </div>

      <div class="chart-card">
        <h4>Jangkauan</h4>
        <canvas id="chartToe"></canvas>
      </div>

      <div class="chart-card">
        <h4>Genggaman</h4>
        <canvas id="chartGrip"></canvas>
      </div>

    </div>

    <div class="detail-rec">

      <h4>${esc(r.title)}</h4>

      <div class="rec-message">
        ${esc(r.message)}
      </div>

      ${
        r.items.length

          ? r.items.map(x => `

              <div class="detail-rec-item">

                <b>
                  ${esc(x.priority)}
                  ·
                  ${esc(x.focus)}
                </b>

                <div
                  class="rec-message"
                  style="margin-top:4px">

                  ${esc(x.reason)}

                </div>

                ${
                  x.exercises?.length

                    ? `

                      <div class="exercise-list">

                        ${x.exercises.map(ex => `

                          <div class="exercise-card">

                            <div class="exercise-name">
                              🏃 ${esc(ex.name || '-')}
                            </div>

                            ${
                              ex.dose
                                ? `<div class="exercise-dose">
                                    ↳ ${esc(ex.dose)}
                                   </div>`
                                : ''
                            }

                            ${
                              ex.info
                                ? `<div class="exercise-info">
                                    ↻ ${esc(ex.info)}
                                   </div>`
                                : ''
                            }

                            ${
                              ex.target
                                ? `<div class="exercise-target">
                                    🎯 ${esc(ex.target)}
                                   </div>`
                                : ''
                            }

                          </div>

                        `).join('')}

                      </div>

                    `
                    : ''
                }

              </div>

            `).join('')

          : ''
      }

    </div>

  `;

  $('detailModal').classList.add('show');

    const h =
    [...(p.history || [])]
        .sort((a,b) => {

        const monthA = getMonthKey(a.month);
        const monthB = getMonthKey(b.month);

        if(monthA !== monthB){
            return monthA.localeCompare(monthB);
        }

        return Number(a.week || 0) -
                Number(b.week || 0);

        });

  const labels =
    h.map(x => `M${x.week}`);

  makeChart(
    'chartSit',
    labels,
    h.map(x => x.sit_stand),
    'Duduk-Berdiri'
  );

  makeChart(
    'chartOne',
    labels,
    h.map(x => x.one_leg),
    '1 Kaki'
  );

  makeChart(
    'chartToe',
    labels,
    h.map(x => x.toe_touch),
    'Jangkauan'
  );

const grip = $('chartGrip');

if(grip){

  const gripWrapper = grip.parentElement;

  if(gripWrapper){
    gripWrapper.style.position = 'relative';
    gripWrapper.style.height = '280px';
    gripWrapper.style.minHeight = '280px';
    gripWrapper.style.maxHeight = '280px';
    gripWrapper.style.overflow = 'hidden';
  }

  charts.push(
    new Chart(
      grip,
      {
          type:'line',

          data:{
            labels,

            datasets:[
              {
                label:'Kanan',
                data:h.map(
                  x => x.grip_right
                ),
                borderWidth:2,
                tension:.3,
                pointRadius:4
              },

              {
                label:'Kiri',
                data:h.map(
                  x => x.grip_left
                ),
                borderWidth:2,
                tension:.3,
                pointRadius:4
              }
            ]
          },

            options:{
            responsive:true,
            maintainAspectRatio:false,

            interaction:{
                intersect:false,
                mode:'index'
            },

            plugins:{
                legend:{
                display:true,
                position:'top'
                }
            },

            scales:{
                x:{
                title:{
                    display:true,
                    text:'Minggu Evaluasi'
                },
                grid:{
                    display:false
                }
                },

                y:{
                beginAtZero:false
                }
            }
            }
        }
      )
    );

  }

}

function makeChart(id, labels, values, label){

  const canvas = $(id);

  if(!canvas) return;

  const wrapper = canvas.parentElement;

  if(wrapper){
    wrapper.style.position = 'relative';
    wrapper.style.height = '260px';
    wrapper.style.minHeight = '260px';
    wrapper.style.maxHeight = '260px';
    wrapper.style.overflow = 'hidden';
  }

  charts.push(
    new Chart(canvas, {

      type: 'line',

      data: {
        labels,

        datasets: [{
          label,

          data: values.map(v =>
            v === null || v === '' || v === undefined
              ? null
              : Number(v)
          ),

          borderWidth: 2.5,
          pointRadius: 4,
          pointHoverRadius: 6,

          tension: 0.3,
          spanGaps: true,
          fill: true
        }]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            padding: 8,
            titleFont: {
              family: 'DM Sans',
              size: 11,
              weight: '600'
            },
            bodyFont: {
              family: 'DM Sans',
              size: 11
            },

            callbacks: {
              label: function(context){
                const value = context.raw;
                return `${label}: ${
                  value === null
                    ? '-'
                    : Number(value).toFixed(1)
                }`;
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Minggu Evaluasi',
              font: {
                family: 'DM Sans',
                size: 11,
                weight: '600'
              }
            },
            grid: {
              display: false
            },
            ticks: {
              font: {
                family: 'DM Sans',
                size: 10
              }
            }
          },

          y: {
            beginAtZero: false,
            ticks: {
              precision: 1,
              font: {
                family: 'DM Sans',
                size: 10
              }
            }
          }
        }
      }
    })
  );
}

function editParticipant(id){
  const p =
    participants.find(x => x.id === id);

  if(!p) return;
  currentDetailId = id;

  resetParticipantForm();
  $('participantId').value =
    p.id;
  $('participantModalTitle').textContent =
    'Edit Peserta';
  $('name').value =
    p.name;
  $('age').value =
    p.age;
  $('gender').value =
    p.gender;

  document
    .querySelectorAll('#participantForm .field')
    .forEach(field => {
      field.style.display = 'none';
    });

  ['name','age','gender'].forEach(id => {
    const input = $(id);
    const field =
      input?.closest('.field');
    if(field){
      field.style.display = '';
    }
  });
  $('participantModal').classList.add('show');
}

function openEvaluationForm(pid,e=null){
  const p =
    participants.find(x => x.id === pid);
  if(!p) return;
  const modal =
    document.getElementById('evaluationModal');
  if(modal){
    modal.remove();
  }

  document.body.insertAdjacentHTML(
    'beforeend',
    `
      <div class="modal show" id="evaluationModal">
        <div class="modal-box">
          <div class="modal-head">
            <div>
              <h3>${e ? 'Edit Evaluasi' : 'Tambah Evaluasi'}</h3>
              <p>${esc(p.name)}</p>
            </div>

            <button
              class="btn btn-soft btn-small"
              onclick="closeModal('evaluationModal')">
              ✕
            </button>

          </div>

          <form id="evaluationForm">

            <input
              type="hidden"
              id="evaluationId"
              value="${e?.id || ''}">

            <input
              type="hidden"
              id="evaluationParticipantId"
              value="${pid}">

            <div class="form-grid">

              <div class="field">
                <label>Bulan</label>
                <input
                  id="evaluationMonth"
                  value="${esc(e?.month || '')}"
                  placeholder="Contoh: September">
              </div>

              <div class="field">
                <label>Minggu</label>
                <input
                  id="evaluationWeek"
                  type="number"
                  min="1"
                  max="5"
                  required
                  value="${
                    e?.week ||
                    ((p.latest_evaluation?.week || 0) + 1)
                  }">
              </div>

              <div class="field">
                <label>Duduk-Berdiri 10×</label>
                <input
                  id="evaluationSit"
                  type="number"
                  step="0.1"
                  value="${e?.sit_stand ?? ''}">
              </div>

              <div class="field">
                <label>Berdiri 1 kaki</label>
                <input
                  id="evaluationOne"
                  type="number"
                  step="0.1"
                  value="${e?.one_leg ?? ''}">
              </div>

              <div class="field">
                <label>Jangkauan</label>
                <input
                  id="evaluationToe"
                  type="number"
                  step="0.1"
                  value="${e?.toe_touch ?? ''}">
              </div>

              <div class="field">
                <label>Grip kanan</label>
                <input
                  id="evaluationRight"
                  type="number"
                  step="0.1"
                  value="${e?.grip_right ?? ''}">
              </div>
              <div class="field">
                <label>Grip kiri</label>
                <input
                  id="evaluationLeft"
                  type="number"
                  step="0.1"
                  value="${e?.grip_left ?? ''}">
              </div>
            </div>
            <div class="form-actions">
              <button
                type="button"
                class="btn btn-soft"
                onclick="closeModal('evaluationModal')">
                Batal
              </button>
              <button class="btn btn-primary">
                Simpan Evaluasi
              </button>
            </div>
          </form>
        </div>
      </div>
    `
  );

  document
    .getElementById('evaluationForm')
    .addEventListener(
      'submit',
      async event => {
        event.preventDefault();
        const id =
          $('evaluationId').value;
        const participantId =
          $('evaluationParticipantId').value;
        const body = {
          month:
            $('evaluationMonth').value,
          week:
            $('evaluationWeek').value,
          sit_stand:
            $('evaluationSit').value,
          one_leg:
            $('evaluationOne').value,
          toe_touch:
            $('evaluationToe').value,
          grip_right:
            $('evaluationRight').value,
          grip_left:
            $('evaluationLeft').value
        };
        try{
          await api(
            id
              ? `/api/evaluations/${id}`
              : `/api/participants/${participantId}/evaluations`,
            {
              method:id ? 'PUT' : 'POST',
              body:JSON.stringify(body)
            }
          );
          closeModal('evaluationModal');
          await refreshAll();
          openDetail(Number(participantId));
          toast(
            id
              ? 'Evaluasi diperbarui'
              : 'Evaluasi ditambahkan'
          );
        }catch(err){
          toast(err.message);
        }
      }
    );
}

function downloadExcelTemplate() {
  const link = document.createElement('a');

  link.href = '/template/Template_Import_Data_Test_Senam.xlsx';
  link.download = 'Template_Import_Data_Test_Senam.xlsx';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function deleteParticipant(id){
  const p =
    participants.find(x => x.id === id);
  if(
    !p ||
    !confirm(
      `Hapus ${p.name} beserta seluruh riwayat evaluasinya?`
    )
  ) return;
  try{
    await api(
      `/api/participants/${id}`,
      {
        method:'DELETE'
      }
    );
    const wasDetailOpen =
      $('detailModal')?.classList.contains('show');
    if(wasDetailOpen){
      closeDetail(false);
    }
    await refreshAll();
    if($('participantListModal')){
      $('participantListModal').classList.add('show');
      renderParticipantPage();
    }
    toast('Peserta dihapus');
  }catch(e){
    toast(e.message);
  }
}

async function refreshAll(){
  try{
    participants =
      await api('/api/participants');
    standards =
      await api('/api/standards');
    renderStats();
    renderMonthFilter();
    renderDashboardCharts();
    renderMovementPhoto(currentMovement);
    renderStandards();
    renderMenu();
  }catch(e){
    console.error(e);
    toast(e.message);
  }
}
[
  'participantChoiceModal',
  'statModal',
  'participantListModal',
  'standardModal',
  'menuModal',
  'reportModal',
  'participantModal',
  'excelModal',
  'detailModal'
].forEach(id => {
  const el = $(id);
  if(!el) return;
  el.addEventListener(
    'click',
    e => {
      if(e.target.id === id){
        closeModal(id)
      }
    }
  );
});
refreshAll();
