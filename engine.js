/**
 * 샬레 선생님 취향 감정서 v3.1 - 조합형 정밀 분석 엔진 (engine.js)
 * - 가슴 사이즈: 1~13 (AA~L), 3(B) 이하 아담한 사이즈 판정
 * - 등급 판정: 조건 충족 등급 중 최고 수치 축 우선 출력 (100점 동점 시 원점수 비교)
 */
const TasteEngine = (() => {
  const ORDER_WEIGHT_ALPHA = 0.12; // 1번 1.12x -> 마지막 0.88x
  const KIVOTOS_AVG_HEIGHT = 156.5;
  const CUP_SCALE = ["AA", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

  const HAIR_COLOR_HEX = {
    "검정": "#1e293b",
    "은발": "#cbd5e1",
    "금발": "#facc15",
    "분홍": "#f472b6",
    "갈색": "#92400e",
    "빨강": "#ef4444",
    "하늘": "#38bdf8",
    "남색": "#1d4ed8",
    "보라": "#8b5cf6",
    "주황": "#fb923c",
    "초록": "#10b981",
    "기타": "#94a3b8",
    "미분류": "#94a3b8",
  };

  function bustToCup(val) {
    const idx = Math.max(1, Math.min(13, Math.round(Number(val) || 5))) - 1;
    return CUP_SCALE[idx];
  }

  function bustAvgToLabel(avg) {
    const clamped = Math.max(1, Math.min(13, Number(avg) || 5));
    const low = Math.floor(clamped);
    const frac = clamped - low;
    if (low < 13 && frac >= 0.35 && frac <= 0.65) {
      return `${CUP_SCALE[low - 1]}~${CUP_SCALE[low]}컵`;
    }
    return `${bustToCup(clamped)}컵`;
  }

  function getOrderWeights(count) {
    if (count <= 1) return [1.0];
    const weights = [];
    for (let i = 0; i < count; i++) {
      const w = 1.0 + ORDER_WEIGHT_ALPHA * (1 - (2 * i) / (count - 1));
      weights.push(Number(w.toFixed(4)));
    }
    return weights;
  }

  function createSeedHash(ids) {
    const key = ids.join("|");
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
  }

  function pickBySeed(array, seed, offset = 0) {
    if (!array || array.length === 0) return "";
    return array[(seed + offset) % array.length];
  }

  // 동시 소체형 판정: 3(B) 이하만 아담한 사이즈
  function isSmallHeightAndBust(student) {
    const h = Number(student.height) || 156;
    const b = Math.max(1, Math.min(13, Number(student.bust) || 5));
    return (h <= 150 && b <= 3) || (h <= 153 && b <= 2);
  }

  // 1. 상세 통계 (신장 / 가슴 AA~L / 발키리 체포 판정 / 헤어 도넛)
  function computeStats(students, orderWeights) {
    const count = students.length;
    const totalWeight = orderWeights.reduce((a, b) => a + b, 0) || count;

    const schoolCounts = {};
    const schoolWeighted = {};
    const weaponWeighted = {};
    const hairCounts = {};
    const hairWeighted = {};

    let heightWeightedSum = 0;
    let heightRawSum = 0;
    let bustWeightedSum = 0;
    let bustRawSum = 0;

    let shortBucket = 0;
    let midBucket = 0;
    let tallBucket = 0;

    let bustPetite = 0;   // 1~3 (AA~B)
    let bustStandard = 0; // 4~6 (C~E)
    let bustGlamour = 0;  // 7~9 (F~H)
    let bustMega = 0;     // 10~13 (I~L)

    let minHeightStu = students[0];
    let maxHeightStu = students[0];
    let minBustStu = students[0];
    let maxBustStu = students[0];

    const smallBothStudents = [];
    let smallBothWeighted = 0;

    students.forEach((s, idx) => {
      const w = orderWeights[idx];
      const h = Number(s.height) || 156;
      const b = Math.max(1, Math.min(13, Number(s.bust) || 5));

      heightWeightedSum += h * w;
      heightRawSum += h;
      bustWeightedSum += b * w;
      bustRawSum += b;

      if (h <= 150) shortBucket++;
      else if (h <= 162) midBucket++;
      else tallBucket++;

      if (b <= 3) bustPetite++;
      else if (b <= 6) bustStandard++;
      else if (b <= 9) bustGlamour++;
      else bustMega++;

      if (h < minHeightStu.height) minHeightStu = s;
      if (h > maxHeightStu.height) maxHeightStu = s;
      if (b < (Number(minBustStu.bust) || 5)) minBustStu = s;
      if (b > (Number(maxBustStu.bust) || 5)) maxBustStu = s;

      if (isSmallHeightAndBust(s)) {
        smallBothStudents.push({
          id: s.id,
          name: s.name,
          height: h,
          bust: b,
          cup: bustToCup(b),
        });
        smallBothWeighted += w;
      }

      schoolCounts[s.school] = (schoolCounts[s.school] || 0) + 1;
      schoolWeighted[s.school] = (schoolWeighted[s.school] || 0) + w;
      weaponWeighted[s.weapon] = (weaponWeighted[s.weapon] || 0) + w;

      const hc = s.hairColor || "기타";
      hairCounts[hc] = (hairCounts[hc] || 0) + 1;
      hairWeighted[hc] = (hairWeighted[hc] || 0) + w;
    });

    const avgHeight = Number((heightWeightedSum / totalWeight).toFixed(1));
    const rawAvgHeight = Number((heightRawSum / count).toFixed(1));
    const heightDiff = Number((avgHeight - KIVOTOS_AVG_HEIGHT).toFixed(1));
    const heightSpread = Number((maxHeightStu.height - minHeightStu.height).toFixed(1));

    let heightTier = "키보토스 표준";
    let heightEpithet = "황금 평균선을 지키는 균형파 선생님";
    let heightComment = "키보토스 평균(156.5cm) 부근의 안정적이고 다채로운 신장 조합입니다.";

    if (avgHeight <= 146) {
      heightTier = "극저신장 집중";
      heightEpithet = "발키리가 주시하는 요정국 전속 교사";
      heightComment = "키보토스 평균을 10cm 이상 밑도는 극단적 저신장 편향이 감지되었습니다.";
    } else if (avgHeight <= 151.5) {
      heightTier = "아담 선호";
      heightEpithet = "눈높이를 맞춘 아담 체구 수집가";
      heightComment = "평균보다 확연히 아담하고 귀여운 체구에 마음이 기울어 있네요.";
    } else if (avgHeight >= 165.5) {
      heightTier = "모델급 장신";
      heightEpithet = "고개를 들고 대화하는 거인국 귀빈";
      heightComment = "165.5cm 이상 최상위 장신 엘리트만 모아둔 압도적인 기럭지 라인업입니다.";
    } else if (avgHeight >= 160.5) {
      heightTier = "장신 선호";
      heightEpithet = "시원한 기럭지의 장신 미학 탐구가";
      heightComment = "키보토스 평균을 훌쩍 넘는 늘씬한 비율을 선호하는 취향이 뚜렷합니다.";
    }

    if (heightSpread >= 28) {
      heightComment += ` 최단·최장 편차 ${heightSpread}cm의 폭넓은 스펙트럼이 돋보입니다.`;
    } else if (heightSpread <= 9) {
      heightComment += ` 편차 ${heightSpread}cm 이내의 철벽 같은 신장 일관성입니다.`;
    }

    const avgBust = Number((bustWeightedSum / totalWeight).toFixed(2));
    const rawAvgBust = Number((bustRawSum / count).toFixed(2));
    const bustVar =
      students.reduce((acc, s) => acc + Math.pow((Number(s.bust) || 5) - rawAvgBust, 2), 0) / count;
    const bustStd = Number(Math.sqrt(bustVar).toFixed(2));

    const avgCupLabel = bustAvgToLabel(avgBust);
    const minCup = bustToCup(minBustStu.bust);
    const maxCup = bustToCup(maxBustStu.bust);

    let bustTier = "C~E · 황금 밸런스";
    let bustEpithet = "어디 하나 모나지 않은 황금 비율 감별사";
    let bustComment = "C~E 구간을 중심으로 전체적인 조화와 안정적인 밸런스를 중시하는 취향입니다.";

    if (avgBust <= 1.85) {
      bustTier = "AA~A · 초슬림";
      bustEpithet = "굴곡보다 순수 실루엣, 평탄 미학의 수호자";
      bustComment = "AA~A 구간에 철저히 집중된 취향입니다. 가볍고 담백한 실루엣에서 매력을 느끼시네요.";
    } else if (avgBust <= 3.15) {
      bustTier = "A~B · 아담 선호";
      bustEpithet = "단정하고 가벼운 아담 사이즈 애호가";
      bustComment = "B컵 이하의 아담하고 깔끔한 비율을 뚜렷하게 선호하는 취향입니다.";
    } else if (avgBust >= 9.2) {
      bustTier = "I~L · 압도적 볼륨";
      bustEpithet = "중력의 법칙을 거스르는 키보토스 거대파";
      bustComment = "I컵 이상 최상위권 볼륨만 정밀하게 선별하셨네요. 취향만큼은 누구보다 솔직하고 확고합니다.";
    } else if (avgBust >= 6.4) {
      bustTier = "F~H · 글래머 선호";
      bustEpithet = "확실한 존재감에 솔직한 글래머 신봉자";
      bustComment = "F~H 구간의 뚜렷한 볼륨감과 성숙한 분위기에 시선이 자연스럽게 쏠리는군요.";
    }

    let bustConsistency = "적당한 스펙트럼";
    if (bustStd <= 1.25) bustConsistency = "철벽 같은 취향 일관성";
    else if (bustStd >= 2.5) bustConsistency = "사이즈 불문 올라운더";

    const smallBothCount = smallBothStudents.length;
    const smallBothRatio = smallBothCount / count;
    const smallBothWeightedRatio = smallBothWeighted / totalWeight;

    let valkyrieLevel = "SAFE";
    let valkyrieTitle = "정상 범위 (안전)";
    let valkyrieDesc = "신장·체형 복합 기준상 특이 위험 신호가 감지되지 않았습니다.";
    let valkyrieDangerBonus = 0;

    if (
      (smallBothCount >= 2 && smallBothWeightedRatio >= 0.5) ||
      (avgHeight <= 147 && avgBust <= 3.0)
    ) {
      valkyrieLevel = "ARREST";
      valkyrieTitle = "발키리 긴급 체포 대상 (영장 발부)";
      valkyrieDesc = `저신장·아담(B 이하) 동시 해당 비율 ${Math.round(
        smallBothWeightedRatio * 100
      )}% (${smallBothCount}/${count}명). 칸나 공안국장이 직접 출동했습니다.`;
      valkyrieDangerBonus = Math.round(36 + smallBothWeightedRatio * 24);
    } else if (smallBothCount >= 2 && smallBothWeightedRatio >= 0.34) {
      valkyrieLevel = "WATCHLIST";
      valkyrieTitle = "발키리 공안국 예의주시 대상";
      valkyrieDesc = `저신장·아담(B 이하) 동시 해당 비율 ${Math.round(
        smallBothWeightedRatio * 100
      )}% (${smallBothCount}/${count}명). 순찰차가 샬레 주변을 서행 중입니다.`;
      valkyrieDangerBonus = 18;
    }

    const sortEntries = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
    const topSchoolName = sortEntries(schoolWeighted)[0]?.[0] || "미상";
    const topWeapon = sortEntries(weaponWeighted)[0]?.[0] || "미상";

    const hairBreakdown = sortEntries(hairWeighted).map(([color, wSum]) => ({
      color,
      count: hairCounts[color] || 0,
      ratio: wSum / totalWeight,
      percent: Number(((wSum / totalWeight) * 100).toFixed(1)),
      hex: HAIR_COLOR_HEX[color] || "#94a3b8",
    }));

    return {
      count,
      avgHeight,
      avgBust,
      avgCupLabel,
      schoolCounts,
      topSchool: {
        name: topSchoolName,
        count: schoolCounts[topSchoolName] || 0,
        ratio: (schoolCounts[topSchoolName] || 0) / count,
      },
      topWeapon,
      topHair: hairBreakdown[0]?.color || "미상",
      hairBreakdown,
      heightDetail: {
        avg: avgHeight,
        rawAvg: rawAvgHeight,
        diff: heightDiff,
        spread: heightSpread,
        min: { id: minHeightStu.id, name: minHeightStu.name, height: minHeightStu.height },
        max: { id: maxHeightStu.id, name: maxHeightStu.name, height: maxHeightStu.height },
        buckets: { short: shortBucket, mid: midBucket, tall: tallBucket },
        tierLabel: heightTier,
        epithet: heightEpithet,
        comment: heightComment,
      },
      bustDetail: {
        avg: avgBust,
        avgCupLabel,
        consistency: bustConsistency,
        buckets: {
          petite: bustPetite,
          standard: bustStandard,
          glamour: bustGlamour,
          mega: bustMega,
        },
        min: { id: minBustStu.id, name: minBustStu.name, cup: minCup },
        max: { id: maxBustStu.id, name: maxBustStu.name, cup: maxCup },
        tierLabel: bustTier,
        epithet: bustEpithet,
        comment: bustComment,
      },
      valkyrieRisk: {
        level: valkyrieLevel,
        title: valkyrieTitle,
        desc: valkyrieDesc,
        smallBothCount,
        smallBothRatio,
        smallBothWeightedRatio,
        smallBothStudents,
        dangerBonus: valkyrieDangerBonus,
      },
    };
  }

  // 2. 태그 집계 + 가상 태그 보정
  function aggregateTags(students, orderWeights, stats, tagsMap) {
    const tagScores = {};
    const tagRawCounts = {};

    students.forEach((s, idx) => {
      const ow = orderWeights[idx];
      for (const entry of s.tags || []) {
        const meta = tagsMap[entry.id];
        const weight = meta ? Number(meta.weight) : 1.0;
        const power = Number(entry.power) || 1;
        tagScores[entry.id] = (tagScores[entry.id] || 0) + power * weight * ow;
        tagRawCounts[entry.id] = (tagRawCounts[entry.id] || 0) + 1;
      }
    });

    const injectVirtual = (tagId, bonus) => {
      if (!tagsMap[tagId]) return;
      tagScores[tagId] = (tagScores[tagId] || 0) + bonus * Number(tagsMap[tagId].weight || 1);
    };

    if (stats.avgHeight <= 148) injectVirtual("_저신장", stats.count * 0.9);
    else if (stats.avgHeight >= 165.5) injectVirtual("_장신", stats.count * 0.9);

    if (stats.avgBust <= 3.15) injectVirtual("_슬림선호", stats.count * 0.75);
    else if (stats.avgBust >= 7.5) injectVirtual("_볼륨선호", stats.count * 0.75);

    if (stats.topSchool.ratio >= 0.5) {
      injectVirtual("_학원편식", stats.count * stats.topSchool.ratio);
    }

    const rankedTags = Object.entries(tagScores)
      .filter(([id]) => Boolean(tagsMap[id]))
      .map(([id, score]) => ({
        id,
        score: Number(score.toFixed(2)),
        count: tagRawCounts[id] || 0,
        meta: tagsMap[id],
      }))
      .sort((a, b) => b.score - a.score);

    return { rankedTags, tagScores, tagRawCounts };
  }

  // 3. 6축 성향 레이더 (표시용 clamped + 동점 판별용 rawRadar 함께 반환)
  function computeRadar(students, orderWeights, stats, tagsMap) {
    const axes = ["chaos", "obsession", "pureLove", "danger", "finance", "power"];
    const sums = { chaos: 0, obsession: 0, pureLove: 0, danger: 0, finance: 0, power: 0 };
    const totalWeight = orderWeights.reduce((a, b) => a + b, 0) || 1;

    students.forEach((s, idx) => {
      const ow = orderWeights[idx];
      for (const entry of s.tags || []) {
        const meta = tagsMap[entry.id];
        if (!meta || !meta.axes) continue;
        const power = Number(entry.power) || 1;
        for (const ax of axes) {
          sums[ax] += (Number(meta.axes[ax]) || 0) * power * ow;
        }
      }
    });

    const rawRadar = {
      chaos: 50 + (sums.chaos / totalWeight) * 14,
      obsession: 8 + (sums.obsession / totalWeight) * 14,
      pureLove: 8 + (sums.pureLove / totalWeight) * 14,
      danger: 10 + (sums.danger / totalWeight) * 16 + stats.valkyrieRisk.dangerBonus,
      finance: 50 + (sums.finance / totalWeight) * 14,
      power: 10 + (sums.power / totalWeight) * 16,
    };

    const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
    const radar = {
      chaos: clamp(rawRadar.chaos),
      obsession: clamp(rawRadar.obsession),
      pureLove: clamp(rawRadar.pureLove),
      danger: clamp(rawRadar.danger),
      finance: clamp(rawRadar.finance),
      power: clamp(rawRadar.power),
    };

    return { radar, rawRadar };
  }

  // 4. 히든 시너지 평가
  function evaluateSynergies(students, stats, tagRawCounts, synergies) {
    const idSet = new Set(students.map((s) => s.id));
    const matched = [];

    for (const rule of synergies) {
      if (rule.reqAllIds?.length && !rule.reqAllIds.every((id) => idSet.has(id))) continue;
      if (rule.reqAnyIds?.length) {
        const hit = rule.reqAnyIds.filter((id) => idSet.has(id)).length;
        if (hit < (rule.reqAnyMin || 1)) continue;
      }
      if (rule.reqTag && (tagRawCounts[rule.reqTag] || 0) < (rule.reqTagMin || 1)) continue;
      if (rule.reqSchool) {
        const ratio = (stats.schoolCounts[rule.reqSchool] || 0) / stats.count;
        if (ratio < (rule.reqSchoolRatio || 0.5)) continue;
      }
      if (rule.minAvgHeight != null && stats.avgHeight < rule.minAvgHeight) continue;
      if (rule.maxAvgHeight != null && stats.avgHeight > rule.maxAvgHeight) continue;
      matched.push(rule);
    }

    if (stats.valkyrieRisk.level === "ARREST") {
      matched.push({
        id: "_valkyrie_combo_arrest",
        priority: 102,
        tier: "HIDDEN",
        badgeName: "발키리 체포 영장 (저신장·아담 사이즈 동시 적발)",
        overrideTitle: "발키리 공안국 긴급 체포 1순위 선생님",
        comment: stats.valkyrieRisk.desc,
      });
    }

    return matched.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  // 5. 칭호 조립
  function composeTitle(rankedTags, activeSynergies, seed) {
    const override = activeSynergies.find((s) => s.overrideTitle);
    if (override) {
      return {
        fullTitle: override.overrideTitle,
        isSpecialOverride: true,
        sourceTags: [],
      };
    }

    const primary = rankedTags[0];
    const secondary =
      rankedTags.find((t, idx) => idx > 0 && t.meta.category !== primary?.meta.category) ||
      rankedTags[1];

    const prefix = secondary
      ? pickBySeed(secondary.meta.prefixes, seed, 3)
      : "평범해 보이지만 수상한";
    const noun = primary
      ? pickBySeed(primary.meta.nouns, seed, 7)
      : "샬레의 미스터리 선생님";

    return {
      fullTitle: `${prefix} ${noun}`.trim(),
      isSpecialOverride: false,
      sourceTags: [primary?.id, secondary?.id].filter(Boolean),
    };
  }

  // 6. 감사 도장 및 소견서 조립 (가장 높은 축 우선 선택)
  function buildAuditText(stats, radar, rawRadar, rankedTags, activeSynergies, students, grades, seed) {
    const RADAR_AXIS_SET = new Set(["chaos", "obsession", "pureLove", "danger", "finance", "power"]);

    const getMetricValues = (axis) => {
      if (axis === "avgHeight") return { val: stats.avgHeight, raw: stats.avgHeight };
      if (axis === "avgBust") return { val: stats.avgBust, raw: stats.avgBust };
      return {
        val: radar[axis] ?? 50,
        raw: rawRadar[axis] ?? (radar[axis] ?? 50),
      };
    };

    const candidates = [];

    grades.forEach((g, idx) => {
      const { val, raw } = getMetricValues(g.targetAxis);
      if (val < g.minVal || val > g.maxVal) return;

      let priorityGroup = 2; // 고수치 달성 등급 (70~100 등)
      let score = val;
      let rawScore = raw;

      if (RADAR_AXIS_SET.has(g.targetAxis)) {
        // 저수치 등급(예: 모범 교사 chaos 0~40)은 고수치 등급이 없을 때만 선택
        if (g.maxVal <= 50) {
          priorityGroup = 1;
          score = 100 - val;
          rawScore = 100 - raw;
        }
      } else if (g.targetAxis === "avgHeight") {
        const distFromAvg = Math.abs(val - KIVOTOS_AVG_HEIGHT);
        score = Math.min(100, 60 + distFromAvg * 2.5);
        rawScore = 60 + distFromAvg * 2.5;
      } else if (g.targetAxis === "avgBust") {
        const distFromMid = Math.abs(val - 5.5);
        score = Math.min(100, 60 + distFromMid * 6);
        rawScore = 60 + distFromMid * 6;
      }

      candidates.push({
        grade: g,
        priorityGroup,
        score,
        rawScore,
        order: idx,
      });
    });

    // 신장×가슴 발키리 체포 대상: danger 점수로 경쟁 (danger가 최고 축일 때 기본 ARREST보다 우선)
    if (stats.valkyrieRisk.level === "ARREST") {
      candidates.push({
        grade: {
          gradeCode: "VALKYRIE_ARREST",
          targetAxis: "danger",
          stampText: "발키리 체포 대상",
          opening: "선생님, 신장과 체형 교차 분석 결과 즉각 공안국 이관 기준을 초과했습니다.",
          closing: "호송 차량이 샬레 정문에 도착했습니다. 변명은 칸나 국장님 앞에서 하세요.",
        },
        priorityGroup: 2,
        score: radar.danger,
        rawScore: rawRadar.danger + 0.01,
        order: -1,
      });
    }

    // 우선순위: 고수치 등급 > 표시 점수 높은 축 > 100점 동점 시 원점수 높은 축 > 시트 등록순
    candidates.sort((a, b) => {
      if (b.priorityGroup !== a.priorityGroup) return b.priorityGroup - a.priorityGroup;
      if (b.score !== a.score) return b.score - a.score;
      if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
      return a.order - b.order;
    });

    const matchedGrade = candidates[0]?.grade || {
      gradeCode: "NORMAL",
      stampText: "검수 완료",
      opening: "선생님, 제출하신 선호 학생 명단을 정밀 감사했습니다.",
      closing: "다음 달 예산 심의 전까지 품행에 유의해 주세요.",
    };

    const bodyLines = [];
    for (const syn of activeSynergies.slice(0, 2)) {
      if (syn.comment && !bodyLines.includes(syn.comment)) bodyLines.push(syn.comment);
    }

    bodyLines.push(
      `사이즈 계측(평균 ${stats.bustDetail.avgCupLabel}): ${stats.bustDetail.epithet} — ${stats.bustDetail.comment}`
    );

    for (const tag of rankedTags.slice(0, 3)) {
      if (bodyLines.length >= 4) break;
      if (tag.meta.yuukaLine && !bodyLines.includes(tag.meta.yuukaLine)) {
        bodyLines.push(tag.meta.yuukaLine);
      }
    }

    const firstMemoStu = students[0]?.personalMemo ? students[0] : null;
    const memoCandidates = students.filter((s) => s.personalMemo);
    const pickedMemoStu =
      firstMemoStu || (memoCandidates.length ? pickBySeed(memoCandidates, seed, 11) : null);
    if (pickedMemoStu) {
      bodyLines.push(`(1순위 참고: ${pickedMemoStu.personalMemo})`);
    }

    return {
      gradeCode: matchedGrade.gradeCode,
      stampText: matchedGrade.stampText,
      opening: matchedGrade.opening,
      bodyLines,
      closing: matchedGrade.closing,
    };
  }

  function analyze(selectedIds, db) {
    const studentMap = new Map(db.students.map((s) => [s.id, s]));
    const selectedStudents = selectedIds.map((id) => studentMap.get(id)).filter(Boolean);
    if (selectedStudents.length === 0) {
      throw new Error("최소 1명 이상의 학생을 선택해야 합니다.");
    }

    const orderWeights = getOrderWeights(selectedStudents.length);
    const seed = createSeedHash(selectedIds);
    const stats = computeStats(selectedStudents, orderWeights);
    const { rankedTags, tagRawCounts } = aggregateTags(selectedStudents, orderWeights, stats, db.tags);
    const { radar, rawRadar } = computeRadar(selectedStudents, orderWeights, stats, db.tags);
    const activeSynergies = evaluateSynergies(selectedStudents, stats, tagRawCounts, db.synergies);
    const title = composeTitle(rankedTags, activeSynergies, seed);
    const audit = buildAuditText(
      stats,
      radar,
      rawRadar,
      rankedTags,
      activeSynergies,
      selectedStudents,
      db.grades,
      seed
    );

    return {
      meta: { analyzedCount: selectedStudents.length, seed, orderWeights },
      title,
      stats,
      radar,
      topTags: rankedTags.slice(0, 5).map(({ id, score, count }) => ({ id, score, count })),
      synergies: activeSynergies.slice(0, 3),
      audit,
    };
  }

  return { analyze, bustToCup, bustAvgToLabel };
})();