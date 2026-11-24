/**
 * 샬레 선생님 취향 감정서 v3.2 - 닉네임 지원 UI, 6축 레이더, 헤어 도넛 & 1080px PNG 렌더러 (app.js)
 */
(() => {
  const MIN_PICK = 3;
  const MAX_PICK = 10;
  const MAX_NICK_LEN = 16;

  const SCHOOL_COLORS = {
    "밀레니엄": "#2563eb",
    "게헨나": "#dc2626",
    "트리니티": "#d97706",
    "아비도스": "#0891b2",
    "백귀야행": "#db2777",
    "산해경": "#059669",
    "붉은겨울": "#b91c1c",
    "발키리": "#4f46e5",
    "아리우스": "#334155",
    "SRT": "#0f766e",
    "하이랜더": "#16a34a",
    "와일드헌트": "#7c3aed",
    "오디세이아": "#0284c7",
    "콜라보": "#e11d48",
  };

  const RADAR_AXES = [
    { key: "chaos", label: "혼돈도" },
    { key: "obsession", label: "집착도" },
    { key: "pureLove", label: "순애도" },
    { key: "danger", label: "발키리 위험도" },
    { key: "finance", label: "파산 위험도" },
    { key: "power", label: "물리력" },
  ];

  const CHOSUNG_LIST = [
    "ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ",
    "ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ",
  ];

  function extractChosung(text) {
    let out = "";
    for (const ch of text) {
      const code = ch.charCodeAt(0) - 0xac00;
      out += code >= 0 && code <= 11171 ? CHOSUNG_LIST[Math.floor(code / 588)] : ch;
    }
    return out;
  }

  function schoolColor(school) {
    return SCHOOL_COLORS[school] || "#475569";
  }

  function formatTeacherLabel(rawNick) {
    const clean = String(rawNick || "").trim().slice(0, MAX_NICK_LEN);
    if (!clean) return "선생님";
    return clean.endsWith("선생님") ? clean : `${clean} 선생님`;
  }

  const state = {
    nickname: "",
    selectedIds: [],
    activeSchool: "전체",
    searchQuery: "",
    sortBy: "default",
    lastResult: null,
  };

  const el = {
    dbErrorBanner: document.getElementById("dbErrorBanner"),
    selectView: document.getElementById("selectView"),
    resultView: document.getElementById("resultView"),
    stickyBar: document.getElementById("stickyBar"),
    nicknameInput: document.getElementById("nicknameInput"),
    searchInput: document.getElementById("searchInput"),
    clearSearchBtn: document.getElementById("clearSearchBtn"),
    sortSelect: document.getElementById("sortSelect"),
    randomPickBtn: document.getElementById("randomPickBtn"),
    resetPickBtn: document.getElementById("resetPickBtn"),
    schoolFilters: document.getElementById("schoolFilters"),
    studentGrid: document.getElementById("studentGrid"),
    emptyGridMsg: document.getElementById("emptyGridMsg"),
    selectedCount: document.getElementById("selectedCount"),
    stickyHint: document.getElementById("stickyHint"),
    progressFill: document.getElementById("progressFill"),
    analyzeBtn: document.getElementById("analyzeBtn"),
    backToSelectBtn: document.getElementById("backToSelectBtn"),
    shareUrlBtn: document.getElementById("shareUrlBtn"),
    copyTextBtn: document.getElementById("copyTextBtn"),
    downloadPngBtn: document.getElementById("downloadPngBtn"),
    radarCanvas: document.getElementById("radarCanvas"),
    hairDonutCanvas: document.getElementById("hairDonutCanvas"),
    hairLegend: document.getElementById("hairLegend"),
    valkyrieAlertBox: document.getElementById("valkyrieAlertBox"),
    toast: document.getElementById("toast"),
  };

  let toastTimer = null;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200);
  }

  if (!window.TASTE_DB || typeof TasteEngine === "undefined") {
    el.dbErrorBanner.classList.remove("hidden");
    el.selectView.classList.add("hidden");
    el.stickyBar.classList.add("hidden");
    return;
  }

  const DB = window.TASTE_DB;
  const studentMap = new Map(DB.students.map((s) => [s.id, s]));

  const indexedStudents = DB.students.map((s, idx) => ({
    ...s,
    _idx: idx,
    _searchName: s.name.toLowerCase(),
    _chosung: extractChosung(s.name),
    _club: (s.club || "").toLowerCase(),
    _clubChosung: extractChosung(s.club || ""),
  }));

  // =========================================================================
  // 1. 선택 화면 렌더링
  // =========================================================================
  function renderSchoolFilters() {
    const schools = ["전체", ...new Set(DB.students.map((s) => s.school))];
    el.schoolFilters.innerHTML = "";
    for (const school of schools) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `filter-chip ${state.activeSchool === school ? "active" : ""}`;
      const count =
        school === "전체"
          ? DB.students.length
          : DB.students.filter((s) => s.school === school).length;
      btn.textContent = `${school} (${count})`;
      btn.addEventListener("click", () => {
        state.activeSchool = school;
        renderSchoolFilters();
        renderStudentGrid();
      });
      el.schoolFilters.appendChild(btn);
    }
  }

  function createAvatarElement(student, compact = false, rankNum = null) {
    const wrap = document.createElement("div");
    wrap.className = compact ? "strip-avatar" : "avatar-wrap";

    const img = document.createElement("img");
    img.src = `assets/${student.id}.webp`;
    img.alt = student.name;
    img.loading = "lazy";
    img.onerror = () => {
      wrap.innerHTML = "";
      const fb = document.createElement("div");
      fb.className = "avatar-fallback";
      fb.style.background = `linear-gradient(135deg, ${schoolColor(student.school)}, #0f172a)`;
      fb.innerHTML = compact
        ? `<span class="fb-char" style="font-size:18px">${student.name.slice(0, 1)}</span>`
        : `<span class="fb-char">${student.name.slice(0, 1)}</span><span class="fb-school">${student.school}</span>`;
      wrap.appendChild(fb);
      if (compact && rankNum != null) {
        const rk = document.createElement("span");
        rk.className = "strip-rank";
        rk.textContent = `#${rankNum}`;
        wrap.appendChild(rk);
      }
    };

    wrap.appendChild(img);
    if (compact && rankNum != null) {
      const rk = document.createElement("span");
      rk.className = "strip-rank";
      rk.textContent = `#${rankNum}`;
      wrap.appendChild(rk);
    }
    return wrap;
  }

  function getFilteredStudents() {
    const q = state.searchQuery.trim().toLowerCase();
    const list = indexedStudents.filter((s) => {
      if (state.activeSchool !== "전체" && s.school !== state.activeSchool) return false;
      if (!q) return true;
      return (
        s._searchName.includes(q) ||
        s._chosung.includes(q) ||
        s._club.includes(q) ||
        s._clubChosung.includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    });

    if (state.sortBy === "name") list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    else if (state.sortBy === "height_asc") list.sort((a, b) => a.height - b.height);
    else if (state.sortBy === "height_desc") list.sort((a, b) => b.height - a.height);
    else list.sort((a, b) => a._idx - b._idx);
    return list;
  }

  function renderStudentGrid() {
    const list = getFilteredStudents();
    el.studentGrid.innerHTML = "";
    el.emptyGridMsg.classList.toggle("hidden", list.length > 0);

    const frag = document.createDocumentFragment();
    for (const s of list) {
      const pickOrder = state.selectedIds.indexOf(s.id);
      const isSelected = pickOrder !== -1;

      const card = document.createElement("button");
      card.type = "button";
      card.className = `student-card ${isSelected ? "selected" : ""}`;
      card.dataset.id = s.id;

      const avatar = createAvatarElement(s, false);
      const badge = document.createElement("span");
      badge.className = "select-badge";
      badge.textContent = isSelected ? String(pickOrder + 1) : "";
      avatar.appendChild(badge);

      const info = document.createElement("div");
      info.className = "card-info";
      info.innerHTML = `
        <div class="card-name">${s.name}</div>
        <div class="card-sub">
          <span>${s.school}</span>
          <span>${s.height}cm</span>
        </div>
      `;

      card.appendChild(avatar);
      card.appendChild(info);
      card.addEventListener("click", () => toggleStudent(s.id));
      frag.appendChild(card);
    }
    el.studentGrid.appendChild(frag);
  }

  function toggleStudent(id) {
    const idx = state.selectedIds.indexOf(id);
    if (idx !== -1) {
      state.selectedIds.splice(idx, 1);
    } else {
      if (state.selectedIds.length >= MAX_PICK) {
        showToast(`최대 ${MAX_PICK}명까지 선택할 수 있습니다.`);
        return;
      }
      state.selectedIds.push(id);
    }
    updateSelectionUI();
  }

  function updateSelectionUI() {
    const count = state.selectedIds.length;
    el.selectedCount.textContent = String(count);
    el.progressFill.style.width = `${(count / MAX_PICK) * 100}%`;

    const ready = count >= MIN_PICK;
    el.analyzeBtn.disabled = !ready;
    el.stickyHint.textContent = ready
      ? "감사 준비 완료!"
      : `최소 ${MIN_PICK - count}명 더 선택해 주세요.`;

    document.querySelectorAll(".student-card").forEach((card) => {
      const order = state.selectedIds.indexOf(card.dataset.id);
      const selected = order !== -1;
      card.classList.toggle("selected", selected);
      const badge = card.querySelector(".select-badge");
      if (badge) badge.textContent = selected ? String(order + 1) : "";
    });
  }

  // =========================================================================
  // 2. 차트 렌더러 (6축 레이더 + 헤어 도넛 — 웹/PNG 공용)
  // =========================================================================
  function drawRadarChart(ctx, cx, cy, radius, radarData, options = {}) {
    const {
      labelFont = '700 13px "Pretendard", sans-serif',
      valueFont = '700 11px "Pretendard", sans-serif',
      labelColor = "#0f172a",
      gridColor = "#cbd5e1",
      fillColor = "rgba(14, 165, 233, 0.22)",
      strokeColor = "#0284c7",
      labelOffset = 32,
    } = options;

    const total = RADAR_AXES.length;
    const angleStep = (Math.PI * 2) / total;
    const startAngle = -Math.PI / 2;

    ctx.save();
    for (let ring = 1; ring <= 5; ring++) {
      const r = (radius * ring) / 5;
      ctx.beginPath();
      for (let i = 0; i < total; i++) {
        const angle = startAngle + i * angleStep;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = ring === 5 ? "#94a3b8" : gridColor;
      ctx.lineWidth = ring === 5 ? 1.5 : 1;
      ctx.stroke();
    }

    for (let i = 0; i < total; i++) {
      const angle = startAngle + i * angleStep;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.beginPath();
    const points = [];
    for (let i = 0; i < total; i++) {
      const val = Math.max(0, Math.min(100, radarData[RADAR_AXES[i].key] ?? 0));
      const r = (radius * val) / 100;
      const angle = startAngle + i * angleStep;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      points.push({ x, y });
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    for (const pt of points) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#f472b6";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < total; i++) {
      const angle = startAngle + i * angleStep;
      const dist = radius + labelOffset;
      const lx = cx + Math.cos(angle) * dist;
      const ly = cy + Math.sin(angle) * dist;
      const val = radarData[RADAR_AXES[i].key] ?? 0;

      ctx.font = labelFont;
      ctx.fillStyle = labelColor;
      ctx.fillText(RADAR_AXES[i].label, lx, ly - 8);

      ctx.font = valueFont;
      ctx.fillStyle = "#0284c7";
      ctx.fillText(`${val}`, lx, ly + 9);
    }
    ctx.restore();
  }

  function drawHairDonutChart(ctx, cx, cy, outerR, innerR, hairBreakdown, options = {}) {
    const {
      centerTitleFont = '800 18px "Pretendard", sans-serif',
      centerSubFont = '700 13px "Pretendard", sans-serif',
    } = options;

    ctx.save();
    let startAngle = -Math.PI / 2;

    for (const seg of hairBreakdown) {
      const sweep = seg.ratio * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sweep);
      ctx.closePath();
      ctx.fillStyle = seg.hex;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      startAngle += sweep;
    }

    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const top = hairBreakdown[0];
    if (top) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#0f172a";
      ctx.font = centerTitleFont;
      ctx.fillText(top.color, cx, cy - 10);
      ctx.fillStyle = "#0284c7";
      ctx.font = centerSubFont;
      ctx.fillText(`${Math.round(top.percent)}%`, cx, cy + 12);
    }
    ctx.restore();
  }

  function renderWebCharts(result) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const rCanvas = el.radarCanvas;
    const rW = 360, rH = 300;
    rCanvas.width = rW * dpr;
    rCanvas.height = rH * dpr;
    rCanvas.style.width = `${rW}px`;
    rCanvas.style.height = `${rH}px`;
    const rCtx = rCanvas.getContext("2d");
    rCtx.scale(dpr, dpr);
    rCtx.clearRect(0, 0, rW, rH);
    drawRadarChart(rCtx, rW / 2, rH / 2 + 4, 96, result.radar);

    const dCanvas = el.hairDonutCanvas;
    const dSize = 210;
    dCanvas.width = dSize * dpr;
    dCanvas.height = dSize * dpr;
    dCanvas.style.width = `${dSize}px`;
    dCanvas.style.height = `${dSize}px`;
    const dCtx = dCanvas.getContext("2d");
    dCtx.scale(dpr, dpr);
    dCtx.clearRect(0, 0, dSize, dSize);
    drawHairDonutChart(dCtx, dSize / 2, dSize / 2, 92, 54, result.stats.hairBreakdown);

    el.hairLegend.innerHTML = "";
    for (const seg of result.stats.hairBreakdown) {
      const row = document.createElement("div");
      row.className = "legend-row";
      row.innerHTML = `
        <span class="legend-left">
          <i class="legend-dot" style="background:${seg.hex}"></i>
          ${seg.color}
        </span>
        <span class="legend-val">${seg.percent}% (${seg.count}명)</span>
      `;
      el.hairLegend.appendChild(row);
    }
  }

  // =========================================================================
  // 3. URL 공유 & 복원 (?picks=...&name=...)
  // =========================================================================
  function buildShareUrl(ids, nickname) {
    const url = new URL(window.location.href);
    url.searchParams.set("picks", ids.join(","));
    const cleanNick = String(nickname || "").trim().slice(0, MAX_NICK_LEN);
    if (cleanNick) url.searchParams.set("name", cleanNick);
    else url.searchParams.delete("name");
    return url.toString();
  }

  function syncUrlPicks(ids, nickname, mode = "push") {
    try {
      const url = new URL(window.location.href);
      if (ids && ids.length >= MIN_PICK) {
        url.searchParams.set("picks", ids.join(","));
        const cleanNick = String(nickname || "").trim().slice(0, MAX_NICK_LEN);
        if (cleanNick) url.searchParams.set("name", cleanNick);
        else url.searchParams.delete("name");
      } else {
        url.searchParams.delete("picks");
        url.searchParams.delete("name");
      }
      if (mode === "push") window.history.pushState({ view: ids ? "result" : "select" }, "", url);
      else window.history.replaceState({ view: ids ? "result" : "select" }, "", url);
    } catch { /* file:// 무시 */ }
  }

  function showSelectView({ updateUrl = true } = {}) {
    el.resultView.classList.add("hidden");
    el.selectView.classList.remove("hidden");
    el.stickyBar.classList.remove("hidden");
    if (updateUrl) syncUrlPicks(null, "", "replace");
  }

  async function handleShareUrl() {
    if (state.selectedIds.length < MIN_PICK) return;
    const shareUrl = buildShareUrl(state.selectedIds, state.nickname);
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("결과 공유 링크가 클립보드에 복사되었습니다.");
    } catch {
      window.prompt("아래 링크를 복사해 공유하세요:", shareUrl);
    }
  }

  function restoreFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const rawName = (params.get("name") || "").trim().slice(0, MAX_NICK_LEN);
    if (rawName) {
      state.nickname = rawName;
      el.nicknameInput.value = rawName;
    }

    const rawPicks = params.get("picks");
    if (!rawPicks) {
      showSelectView({ updateUrl: false });
      return;
    }
    const uniqueValid = [...new Set(rawPicks.split(",").map((s) => s.trim()))]
      .filter((id) => studentMap.has(id))
      .slice(0, MAX_PICK);
    if (uniqueValid.length >= MIN_PICK) {
      state.selectedIds = uniqueValid;
      updateSelectionUI();
      runAnalysis({ syncUrl: false });
    } else {
      showSelectView({ updateUrl: false });
    }
  }

  // =========================================================================
  // 4. 분석 실행 & 결과 바인딩
  // =========================================================================
  function runAnalysis({ syncUrl = true } = {}) {
    if (state.selectedIds.length < MIN_PICK) return;
    state.nickname = el.nicknameInput.value.trim().slice(0, MAX_NICK_LEN);

    const result = TasteEngine.analyze(state.selectedIds, DB);
    state.lastResult = result;

    const teacherLabel = formatTeacherLabel(state.nickname);
    const selectedStudents = state.selectedIds.map((id) => studentMap.get(id)).filter(Boolean);
    const docNum = String(result.meta.seed % 10000).padStart(4, "0");

    document.getElementById("resDocCode").textContent = `SCHALE-AUDIT-${docNum}`;
    document.getElementById("resDocSubtitle").textContent =
      `${teacherLabel} 선호 학생 정밀 감사 결과서`;
    document.getElementById("resTeacherBadge").textContent = `감사 대상 · ${teacherLabel}`;
    document.getElementById("resStamp").textContent = result.audit.stampText;
    document.getElementById("resOverrideBadge").classList.toggle("hidden", !result.title.isSpecialOverride);
    document.getElementById("resMainTitle").textContent = result.title.fullTitle;

    // 선택 학생 스트립
    const strip = document.getElementById("resSelectedStrip");
    strip.innerHTML = "";
    selectedStudents.forEach((s, i) => {
      const item = document.createElement("div");
      item.className = "strip-item";
      item.appendChild(createAvatarElement(s, true, i + 1));
      const nm = document.createElement("div");
      nm.className = "strip-name";
      nm.textContent = s.name;
      item.appendChild(nm);
      strip.appendChild(item);
    });

    // 요약 4칸
    const hd = result.stats.heightDetail;
    const bd = result.stats.bustDetail;
    const diffSign = hd.diff >= 0 ? `+${hd.diff}cm` : `${hd.diff}cm`;

    document.getElementById("resAvgHeight").textContent = `${hd.avg}cm (${diffSign})`;
    document.getElementById("resAvgBust").textContent = `평균 ${bd.avgCupLabel}`;
    document.getElementById("resTopSchool").textContent =
      `${result.stats.topSchool.name} (${Math.round(result.stats.topSchool.ratio * 100)}%)`;
    document.getElementById("resTopWeapon").textContent = result.stats.topWeapon;

    // 발키리 교차 경보 배너
    const vr = result.stats.valkyrieRisk;
    if (vr.level !== "SAFE") {
      el.valkyrieAlertBox.className = `valkyrie-alert level-${vr.level}`;
      const listTxt = vr.smallBothStudents
        .map((s) => `${s.name}(${s.height}cm / ${s.cup})`)
        .join(", ");
      el.valkyrieAlertBox.innerHTML = `
        <strong>🚨 ${vr.title}</strong>
        ${vr.desc}<br/>
        <span style="opacity:0.88">해당 학생: ${listTxt}</span>
      `;
    } else {
      el.valkyrieAlertBox.className = "valkyrie-alert hidden";
    }

    // 1) 신장 심화 카드
    const hPct = Math.max(3, Math.min(97, ((hd.avg - 125) / (180 - 125)) * 100));
    document.getElementById("resHeightTier").textContent = hd.tierLabel;
    document.getElementById("resHeightHero").textContent = `${hd.avg}cm`;
    document.getElementById("resHeightDiff").textContent = `키보토스 평균 대비 ${diffSign}`;
    document.getElementById("resHeightEpithet").textContent = `“${hd.epithet}”`;
    document.getElementById("resHeightGaugeFill").style.width = `${hPct}%`;
    document.getElementById("resHeightPointer").style.left = `${hPct}%`;
    document.getElementById("resHeightComment").textContent = hd.comment;
    document.getElementById("resHeightExtremes").innerHTML = `
      <div class="extreme-pill"><span>최단신</span><strong>${hd.min.name} (${hd.min.height}cm)</strong></div>
      <div class="extreme-pill"><span>최장신</span><strong>${hd.max.name} (${hd.max.height}cm)</strong></div>
    `;
    document.getElementById("resHeightDist").innerHTML = `
      <span class="dist-chip">아담(~150) ${hd.buckets.short}명</span>
      <span class="dist-chip">표준(151~162) ${hd.buckets.mid}명</span>
      <span class="dist-chip">장신(163~) ${hd.buckets.tall}명</span>
    `;

    // 2) 가슴 사이즈 심화 카드
    const bPct = Math.max(3, Math.min(97, ((bd.avg - 1) / 12) * 100));
    document.getElementById("resBustTier").textContent = bd.tierLabel;
    document.getElementById("resBustHero").textContent = bd.avgCupLabel;
    document.getElementById("resBustConsistency").textContent = bd.consistency;
    document.getElementById("resBustEpithet").textContent = `“${bd.epithet}”`;
    document.getElementById("resBustGaugeFill").style.width = `${bPct}%`;
    document.getElementById("resBustPointer").style.left = `${bPct}%`;
    document.getElementById("resBustComment").textContent = bd.comment;
    document.getElementById("resBustExtremes").innerHTML = `
      <div class="extreme-pill"><span>최소 사이즈</span><strong>${bd.min.name} (${bd.min.cup})</strong></div>
      <div class="extreme-pill"><span>최대 사이즈</span><strong>${bd.max.name} (${bd.max.cup})</strong></div>
    `;
    document.getElementById("resBustDist").innerHTML = `
      <span class="dist-chip">아담(AA~B) ${bd.buckets.petite}명</span>
      <span class="dist-chip">표준(C~E) ${bd.buckets.standard}명</span>
      <span class="dist-chip">글래머(F~H) ${bd.buckets.glamour}명</span>
      <span class="dist-chip">압도적(I~L) ${bd.buckets.mega}명</span>
    `;

    // 6축 레이더 & 헤어 도넛
    renderWebCharts(result);

    // 상위 태그
    const tagsEl = document.getElementById("resTopTags");
    tagsEl.innerHTML = "";
    for (const t of result.topTags) {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.innerHTML = `#${t.id.replace(/^_/, "")}<span>${t.score}pt</span>`;
      tagsEl.appendChild(pill);
    }

    // 히든 시너지
    const synEl = document.getElementById("resSynergies");
    synEl.innerHTML = "";
    if (result.synergies.length === 0) {
      synEl.innerHTML = `<div class="synergy-card"><div class="synergy-desc">특이 시너지 미발동 — 균형 잡힌 일반 조합입니다.</div></div>`;
    } else {
      for (const syn of result.synergies) {
        const card = document.createElement("div");
        card.className = `synergy-card tier-${syn.tier || "NORMAL"}`;
        card.innerHTML = `
          <div class="synergy-head">
            <span class="synergy-tier">${syn.tier || "NORMAL"}</span>
            <span class="synergy-name">${syn.badgeName}</span>
          </div>
          <div class="synergy-desc">${syn.comment}</div>
        `;
        synEl.appendChild(card);
      }
    }

    // 유우카 소견서
    document.getElementById("resAuditHead").textContent =
      `세미나 회계 감사관 소견서 — 대상: ${teacherLabel}`;
    document.getElementById("resAuditOpening").textContent = result.audit.opening;
    const bodyUl = document.getElementById("resAuditBody");
    bodyUl.innerHTML = "";
    for (const line of result.audit.bodyLines) {
      const li = document.createElement("li");
      li.textContent = line;
      bodyUl.appendChild(li);
    }
    document.getElementById("resAuditClosing").textContent = result.audit.closing;

    el.selectView.classList.add("hidden");
    el.stickyBar.classList.add("hidden");
    el.resultView.classList.remove("hidden");
    if (syncUrl) syncUrlPicks(state.selectedIds, state.nickname, "push");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // =========================================================================
  // 5. 고화질 1080px PNG 감정서 렌더러 (닉네임 반영)
  // =========================================================================
  function wrapTextLines(ctx, text, maxWidth) {
    const lines = [];
    let current = "";
    for (const ch of text) {
      const test = current + ch;
      if (ctx.measureText(test).width > maxWidth && current.length > 0) {
        lines.push(current);
        current = ch;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function loadImageSafe(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function renderAuditPngCanvas(result, selectedStudents, allowLocalImages = true) {
    const W = 1080;
    const PAD = 56;
    const CW = W - PAD * 2;
    const teacherLabel = formatTeacherLabel(state.nickname);

    const loadedImgs = allowLocalImages
      ? await Promise.all(selectedStudents.map((s) => loadImageSafe(`assets/${s.id}.webp`)))
      : selectedStudents.map(() => null);

    const mCtx = document.createElement("canvas").getContext("2d");
    mCtx.font = '900 38px "Pretendard", sans-serif';
    const titleLines = wrapTextLines(mCtx, result.title.fullTitle, CW - 235);

    mCtx.font = '500 19px "Pretendard", sans-serif';
    const wrappedAudit = [];
    for (const line of result.audit.bodyLines) {
      wrappedAudit.push(...wrapTextLines(mCtx, `• ${line}`, CW - 64));
    }

    const hasAlert = result.stats.valkyrieRisk.level !== "SAFE";
    const synList = result.synergies.length
      ? result.synergies
      : [{ tier: "NORMAL", badgeName: "표준 균형 조합", comment: "특이 시너지가 발동하지 않은 안정적 픽입니다." }];

    const bioCardH = 228;
    const chartH = 356;
    const alertH = hasAlert ? 84 : 0;
    const synBlockH = 74 + synList.length * 78;
    const auditBoxH = 148 + wrappedAudit.length * 30;
    const H = 210 + titleLines.length * 46 + 130 + alertH + (bioCardH + 20) + (chartH + 22) + synBlockH + 14 + auditBoxH + 56;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    // 블루프린트 배경
    ctx.fillStyle = "#f4f8fc";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(14, 165, 233, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // 상단 헤더 (닉네임 반영)
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, 114);
    const grad = ctx.createLinearGradient(0, 114, W, 114);
    grad.addColorStop(0, "#f472b6");
    grad.addColorStop(1, "#0ea5e9");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 108, W, 8);

    const docNum = String(result.meta.seed % 10000).padStart(4, "0");
    ctx.fillStyle = "#38bdf8";
    ctx.font = '800 17px "Pretendard", sans-serif';
    ctx.fillText(`S.C.H.A.L.E // SPECIAL AUDIT v3 #${docNum}  ·  대상: ${teacherLabel}`, PAD, 44);
    ctx.fillStyle = "#ffffff";
    ctx.font = '800 32px "Pretendard", sans-serif';
    const pngHeaderTitle = state.nickname
      ? `${teacherLabel} 취향 정밀 감정서`
      : "샬레 선생님 취향 정밀 감정서";
    ctx.fillText(pngHeaderTitle, PAD, 86);

    // 붉은 도장
    ctx.save();
    ctx.translate(W - PAD - 108, 184);
    ctx.rotate(-0.1);
    ctx.strokeStyle = "#e11d48";
    ctx.lineWidth = 4;
    ctx.fillStyle = "rgba(225, 29, 72, 0.06)";
    ctx.fillRect(-108, -28, 216, 56);
    ctx.strokeRect(-108, -28, 216, 56);
    ctx.fillStyle = "#e11d48";
    ctx.font = '900 22px "Pretendard", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(result.audit.stampText, 0, 2);
    ctx.restore();

    // 메인 칭호
    let y = 166;
    ctx.fillStyle = "#0284c7";
    ctx.font = '800 17px "Pretendard", sans-serif';
    ctx.fillText(result.title.isSpecialOverride ? "★ SPECIAL SYNERGY TITLE" : "감정 칭호", PAD, y);
    y += 44;
    ctx.fillStyle = "#0f172a";
    ctx.font = '900 38px "Pretendard", sans-serif';
    for (const tl of titleLines) {
      ctx.fillText(tl, PAD, y);
      y += 46;
    }

    // 선택 학생 스트립
    y += 10;
    const thumb = 82, gap = 14;
    selectedStudents.forEach((s, idx) => {
      const tx = PAD + idx * (thumb + gap);
      if (tx + thumb > W - PAD) return;
      const img = loadedImgs[idx];
      if (img) ctx.drawImage(img, tx, y, thumb, thumb);
      else {
        ctx.fillStyle = schoolColor(s.school);
        ctx.fillRect(tx, y, thumb, thumb);
        ctx.fillStyle = "#ffffff";
        ctx.font = '800 28px "Pretendard", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.name.slice(0, 1), tx + thumb / 2, y + thumb / 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(tx, y, 26, 20);
      ctx.fillStyle = "#ffffff";
      ctx.font = '800 12px "Pretendard", sans-serif';
      ctx.fillText(`#${idx + 1}`, tx + 5, y + 14);
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 2;
      ctx.strokeRect(tx, y, thumb, thumb);

      ctx.fillStyle = "#475569";
      ctx.font = '600 14px "Pretendard", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(s.name.slice(0, 5), tx + thumb / 2, y + thumb + 18);
      ctx.textAlign = "left";
    });
    y += thumb + 38;

    // 발키리 교차 경보 배너
    if (hasAlert) {
      const isArrest = result.stats.valkyrieRisk.level === "ARREST";
      ctx.fillStyle = isArrest ? "#fff1f2" : "#fffbeb";
      ctx.fillRect(PAD, y, CW, 68);
      ctx.strokeStyle = isArrest ? "#fda4af" : "#fcd34d";
      ctx.strokeRect(PAD, y, CW, 68);
      ctx.fillStyle = isArrest ? "#e11d48" : "#d97706";
      ctx.fillRect(PAD, y, 8, 68);

      ctx.fillStyle = isArrest ? "#881337" : "#78350f";
      ctx.font = '800 19px "Pretendard", sans-serif';
      ctx.fillText(`🚨 ${result.stats.valkyrieRisk.title}`, PAD + 22, y + 28);
      ctx.font = '600 15px "Pretendard", sans-serif';
      ctx.fillText(result.stats.valkyrieRisk.desc, PAD + 22, y + 54);
      y += 84;
    }

    // 신장 & 가슴 사이즈 2단 카드
    const halfW = (CW - 18) / 2;
    const hd = result.stats.heightDetail;
    const bd = result.stats.bustDetail;

    const drawBioCardPng = (bx, cfg) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(bx, y, halfW, bioCardH);
      ctx.strokeStyle = "#d6e3f0";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, y, halfW, bioCardH);
      ctx.fillStyle = cfg.topColor;
      ctx.fillRect(bx, y, halfW, 5);

      ctx.fillStyle = cfg.darkColor;
      ctx.font = '800 12px "Pretendard", sans-serif';
      ctx.fillText(cfg.code, bx + 18, y + 26);

      ctx.fillStyle = "#0f172a";
      ctx.font = '800 17px "Pretendard", sans-serif';
      ctx.fillText(`${cfg.title} · ${cfg.tier}`, bx + 18, y + 48);

      ctx.textAlign = "right";
      ctx.fillStyle = cfg.darkColor;
      ctx.font = '900 28px "Pretendard", sans-serif';
      ctx.fillText(cfg.heroVal, bx + halfW - 18, y + 40);
      ctx.fillStyle = "#64748b";
      ctx.font = '700 12px "Pretendard", sans-serif';
      ctx.fillText(cfg.heroSub, bx + halfW - 18, y + 57);
      ctx.textAlign = "left";

      const epY = y + 66;
      ctx.fillStyle = cfg.bannerBg;
      ctx.fillRect(bx + 18, epY, halfW - 36, 48);
      ctx.strokeStyle = cfg.bannerBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 18, epY, halfW - 36, 48);
      ctx.fillStyle = cfg.darkColor;
      ctx.fillRect(bx + 18, epY, 5, 48);

      ctx.fillStyle = "#0f172a";
      ctx.font = '900 18px "Pretendard", sans-serif';
      ctx.fillText(`“${cfg.epithet}”`, bx + 32, epY + 31);

      const barY = y + 132;
      const barW = halfW - 36;
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(bx + 18, barY, barW, 9);
      ctx.fillStyle = cfg.topColor;
      ctx.fillRect(bx + 18, barY, (barW * cfg.pct) / 100, 9);

      const markX = bx + 18 + (barW * cfg.midPct) / 100;
      ctx.fillStyle = cfg.darkColor;
      ctx.fillRect(markX - 1, barY - 3, 2, 15);

      const ptrX = bx + 18 + (barW * cfg.pct) / 100;
      ctx.beginPath();
      ctx.arc(ptrX, barY + 4.5, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = cfg.darkColor;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = "#64748b";
      ctx.font = '700 12px "Pretendard", sans-serif';
      cfg.ticks.forEach((tk, i) => {
        const ratio = i / (cfg.ticks.length - 1);
        ctx.textAlign = i === 0 ? "left" : i === cfg.ticks.length - 1 ? "right" : "center";
        ctx.fillText(tk, bx + 18 + barW * ratio, barY + 26);
      });
      ctx.textAlign = "left";

      ctx.fillStyle = "#334155";
      ctx.font = '700 14px "Pretendard", sans-serif';
      ctx.fillText(cfg.extremesLine, bx + 18, y + 186);

      ctx.fillStyle = "#64748b";
      ctx.font = '600 13px "Pretendard", sans-serif';
      ctx.fillText(cfg.distLine, bx + 18, y + 210);
    };

    const hPct = Math.max(3, Math.min(97, ((hd.avg - 125) / 55) * 100));
    const bPct = Math.max(3, Math.min(97, ((bd.avg - 1) / 12) * 100));
    const diffSign = hd.diff >= 0 ? `+${hd.diff}cm` : `${hd.diff}cm`;

    drawBioCardPng(PAD, {
      code: "BIOMETRIC // HEIGHT",
      title: "신장 계측",
      tier: hd.tierLabel,
      heroVal: `${hd.avg}cm`,
      heroSub: `평균 대비 ${diffSign}`,
      epithet: hd.epithet,
      pct: hPct,
      midPct: 57.3,
      ticks: ["125cm", "평균 156.5cm", "180cm"],
      extremesLine: `최단 ${hd.min.name}(${hd.min.height}cm)  ·  최장 ${hd.max.name}(${hd.max.height}cm)`,
      distLine: `아담 ${hd.buckets.short}명 · 표준 ${hd.buckets.mid}명 · 장신 ${hd.buckets.tall}명`,
      topColor: "#0ea5e9",
      darkColor: "#0284c7",
      bannerBg: "#f0f9ff",
      bannerBorder: "#bae6fd",
    });

    drawBioCardPng(PAD + halfW + 18, {
      code: "BIOMETRIC // SIZE (AA–L)",
      title: "선호 사이즈",
      tier: bd.tierLabel,
      heroVal: bd.avgCupLabel,
      heroSub: bd.consistency,
      epithet: bd.epithet,
      pct: bPct,
      midPct: 20.8,
      ticks: ["AA", "B(아담)", "E", "H", "L"],
      extremesLine: `최소 ${bd.min.name}(${bd.min.cup})  ·  최대 ${bd.max.name}(${bd.max.cup})`,
      distLine: `아담(AA~B) ${bd.buckets.petite} · 표준(C~E) ${bd.buckets.standard} · 글래머(F~H) ${bd.buckets.glamour} · 압도적(I~L) ${bd.buckets.mega}`,
      topColor: "#ec4899",
      darkColor: "#be185d",
      bannerBg: "#fdf2f8",
      bannerBorder: "#fbcfe8",
    });

    y += bioCardH + 20;

    // 2단 차트: 좌측 6축 레이더 / 우측 선호 헤어 컬러 도넛
    const leftW = 490;
    const rightW = CW - leftW - 18;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(PAD, y, leftW, chartH);
    ctx.strokeStyle = "#d6e3f0";
    ctx.strokeRect(PAD, y, leftW, chartH);
    ctx.fillStyle = "#0284c7";
    ctx.font = '800 17px "Pretendard", sans-serif';
    ctx.fillText("6축 성향 정밀 계측 (집착 · 순애 분리)", PAD + 20, y + 32);

    drawRadarChart(ctx, PAD + leftW / 2, y + 198, 110, result.radar, {
      labelFont: '700 15px "Pretendard", sans-serif',
      valueFont: '800 13px "Pretendard", sans-serif',
      labelOffset: 34,
    });

    const rx = PAD + leftW + 18;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(rx, y, rightW, chartH);
    ctx.strokeStyle = "#d6e3f0";
    ctx.strokeRect(rx, y, rightW, chartH);
    ctx.fillStyle = "#0284c7";
    ctx.font = '800 17px "Pretendard", sans-serif';
    ctx.fillText("선호 헤어 컬러 분포", rx + 20, y + 32);

    drawHairDonutChart(ctx, rx + 126, y + 196, 94, 54, result.stats.hairBreakdown, {
      centerTitleFont: '800 20px "Pretendard", sans-serif',
      centerSubFont: '800 14px "Pretendard", sans-serif',
    });

    let ly = y + 92;
    for (const seg of result.stats.hairBreakdown.slice(0, 7)) {
      ctx.fillStyle = seg.hex;
      ctx.fillRect(rx + 244, ly - 11, 14, 14);
      ctx.strokeStyle = "rgba(15,23,42,0.2)";
      ctx.strokeRect(rx + 244, ly - 11, 14, 14);
      ctx.fillStyle = "#0f172a";
      ctx.font = '700 16px "Pretendard", sans-serif';
      ctx.fillText(seg.color, rx + 266, ly + 1);
      ctx.fillStyle = "#475569";
      ctx.font = '700 15px "Pretendard", sans-serif';
      ctx.textAlign = "right";
      ctx.fillText(`${seg.percent}%`, rx + rightW - 20, ly + 1);
      ctx.textAlign = "left";
      ly += 34;
    }
    y += chartH + 22;

    // 핵심 키워드 + 히든 시너지
    ctx.fillStyle = "#0284c7";
    ctx.font = '800 17px "Pretendard", sans-serif';
    ctx.fillText("핵심 키워드 & 발동 시너지", PAD, y + 16);
    y += 30;

    let tx = PAD;
    ctx.font = '700 16px "Pretendard", sans-serif';
    for (const t of result.topTags) {
      const label = `#${t.id.replace(/^_/, "")}`;
      const tw = ctx.measureText(label).width + 24;
      ctx.fillStyle = "#e0f2fe";
      ctx.fillRect(tx, y, tw, 32);
      ctx.strokeStyle = "#7dd3fc";
      ctx.strokeRect(tx, y, tw, 32);
      ctx.fillStyle = "#0369a1";
      ctx.fillText(label, tx + 12, y + 21);
      tx += tw + 8;
    }
    y += 44;

    const tierColors = { HIDDEN: "#d97706", RARE: "#db2777", NORMAL: "#0284c7" };
    for (const syn of synList) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(PAD, y, CW, 70);
      ctx.strokeStyle = "#d6e3f0";
      ctx.strokeRect(PAD, y, CW, 70);
      ctx.fillStyle = tierColors[syn.tier] || "#0284c7";
      ctx.fillRect(PAD, y, 6, 70);

      ctx.fillStyle = "#0f172a";
      ctx.font = '800 18px "Pretendard", sans-serif';
      ctx.fillText(`[${syn.tier || "NORMAL"}] ${syn.badgeName}`, PAD + 18, y + 28);
      ctx.fillStyle = "#475569";
      ctx.font = '500 15px "Pretendard", sans-serif';
      ctx.fillText(wrapTextLines(ctx, syn.comment, CW - 34)[0] || "", PAD + 18, y + 54);
      y += 78;
    }

    // 유우카 소견서
    y += 14;
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(PAD, y, CW, auditBoxH);
    ctx.fillStyle = "#f472b6";
    ctx.fillRect(PAD, y, 8, auditBoxH);

    let ay = y + 38;
    ctx.fillStyle = "#38bdf8";
    ctx.font = '800 16px "Pretendard", sans-serif';
    ctx.fillText(`세미나 회계 감사관 소견서 — 대상: ${teacherLabel}`, PAD + 30, ay);
    ay += 34;
    ctx.fillStyle = "#ffffff";
    ctx.font = '700 22px "Pretendard", sans-serif';
    ctx.fillText(result.audit.opening, PAD + 30, ay);
    ay += 34;
    ctx.fillStyle = "#cbd5e1";
    ctx.font = '500 19px "Pretendard", sans-serif';
    for (const line of wrappedAudit) {
      ctx.fillText(line, PAD + 30, ay);
      ay += 30;
    }
    ay += 10;
    ctx.fillStyle = "#f9a8d4";
    ctx.font = '700 18px "Pretendard", sans-serif';
    ctx.fillText(result.audit.closing, PAD + 30, ay);

    ctx.fillStyle = "#64748b";
    ctx.font = '600 15px "Pretendard", sans-serif';
    ctx.fillText("SCHALE TASTE AUDIT v3 • FAN PROJECT", PAD, H - 22);
    return canvas;
  }

  async function handleDownloadPng() {
    if (!state.lastResult) return;
    const selectedStudents = state.selectedIds.map((id) => studentMap.get(id)).filter(Boolean);
    try {
      let canvas = await renderAuditPngCanvas(state.lastResult, selectedStudents, true);
      let dataUrl;
      try {
        dataUrl = canvas.toDataURL("image/png");
      } catch {
        canvas = await renderAuditPngCanvas(state.lastResult, selectedStudents, false);
        dataUrl = canvas.toDataURL("image/png");
      }
      const link = document.createElement("a");
      const safeNick = state.nickname.replace(/[\\/:*?"<>|\s]+/g, "_");
      const prefix = safeNick ? `schale_audit_${safeNick}` : "schale_taste_audit";
      link.download = `${prefix}_${state.lastResult.meta.seed % 10000}.png`;
      link.href = dataUrl;
      link.click();
      showToast("고화질 PNG 감정서가 저장되었습니다.");
    } catch (err) {
      console.error(err);
      showToast("PNG 생성 중 오류가 발생했습니다.");
    }
  }

  async function handleCopyText() {
    if (!state.lastResult) return;
    const r = state.lastResult;
    const hd = r.stats.heightDetail;
    const bd = r.stats.bustDetail;
    const teacherLabel = formatTeacherLabel(state.nickname);
    const names = state.selectedIds.map((id) => studentMap.get(id)?.name).filter(Boolean).join(", ");
    const synText = r.synergies.length ? r.synergies.map((s) => `[${s.badgeName}]`).join(" ") : "없음";
    const summary = [
      `[${teacherLabel} 취향 감정서 - ${r.audit.stampText}]`,
      `칭호: ${r.title.fullTitle}`,
      `선택 학생(${r.meta.analyzedCount}명): ${names}`,
      `신장: ${hd.avg}cm — 「${hd.epithet}」`,
      `사이즈: 평균 ${bd.avgCupLabel} — 「${bd.epithet}」`,
      `대표 헤어: ${r.stats.topHair} (${r.stats.hairBreakdown[0]?.percent ?? 0}%) | 주력 학원: ${r.stats.topSchool.name}`,
      `6축 성향: 혼돈 ${r.radar.chaos} · 집착 ${r.radar.obsession} · 순애 ${r.radar.pureLove} · 위험 ${r.radar.danger} · 파산 ${r.radar.finance} · 물리 ${r.radar.power}`,
      `발동 시너지: ${synText}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(summary);
      showToast("커뮤니티 공유용 요약 텍스트를 복사했습니다.");
    } catch {
      showToast("클립보드 복사에 실패했습니다.");
    }
  }

  // 이벤트 바인딩
  el.nicknameInput.addEventListener("input", (e) => {
    state.nickname = e.target.value.trim().slice(0, MAX_NICK_LEN);
  });
  el.searchInput.addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    el.clearSearchBtn.classList.toggle("hidden", !state.searchQuery);
    renderStudentGrid();
  });
  el.clearSearchBtn.addEventListener("click", () => {
    state.searchQuery = "";
    el.searchInput.value = "";
    el.clearSearchBtn.classList.add("hidden");
    renderStudentGrid();
  });
  el.sortSelect.addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    renderStudentGrid();
  });
  el.randomPickBtn.addEventListener("click", () => {
    const pool = [...DB.students].sort(() => Math.random() - 0.5);
    state.selectedIds = pool.slice(0, Math.min(5, pool.length)).map((s) => s.id);
    updateSelectionUI();
    showToast("학생 5명을 무작위로 선택했습니다.");
  });
  el.resetPickBtn.addEventListener("click", () => {
    state.selectedIds = [];
    updateSelectionUI();
  });
  el.analyzeBtn.addEventListener("click", () => runAnalysis({ syncUrl: true }));
  el.backToSelectBtn.addEventListener("click", () => showSelectView({ updateUrl: true }));
  el.shareUrlBtn.addEventListener("click", handleShareUrl);
  el.downloadPngBtn.addEventListener("click", handleDownloadPng);
  el.copyTextBtn.addEventListener("click", handleCopyText);
  window.addEventListener("popstate", restoreFromUrl);

  renderSchoolFilters();
  renderStudentGrid();
  updateSelectionUI();
  restoreFromUrl();
})();
