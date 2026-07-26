/* ============================================================
   Bharat Polity Drillhouse — MCQ practice engine
   Questions are generated client-side from QBANK (see qbank_data.js).
   No backend, works fully offline once loaded.
   ============================================================ */

const TOPIC_META = {
  articles:  { label: "Articles", eg: "Art. 32 = Right to Constitutional Remedies" },
  parts:     { label: "Parts of the Constitution", eg: "Part III = Fundamental Rights" },
  schedules: { label: "Schedules", eg: "9th Schedule = Land reform" },
  sources:   { label: "Sources (borrowed features)", eg: "USA → Fundamental Rights" },
  amendments:{ label: "Constitutional Amendments", eg: "42nd Amendment = Mini-Constitution" },
  cases:     { label: "Landmark SC Cases", eg: "Kesavananda Bharati = Basic structure" },
  languages: { label: "8th Schedule Languages", eg: "Sindhi = added by 21st Amendment" },
  acts:      { label: "Pre-1947 GOI Acts", eg: "GOI Act 1935 = Federal scheme, provincial autonomy" },
  bodies2:   { label: "Newer Bodies", eg: "GST Council = Article 279A" }
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Build one MCQ from a topic pool. Randomly asks either
   "what does X deal with" or "which item deals with Y". */
function genMCQ(topicKey, pool, usedKeys) {
  let attempts = 0, item, key;
  do {
    item = pick(pool);
    key = item.a;
    attempts++;
  } while (usedKeys.has(key) && attempts < 40 && usedKeys.size < pool.length);
  usedKeys.add(key);

  const askForDesc = Math.random() < 0.5; // true: show label, ask description; false: reverse
  // build distractors from same pool, excluding the correct item
  const others = pool.filter(p => p.a !== item.a);
  const distractors = shuffle(others).slice(0, 3);
  const optionItems = shuffle([item, ...distractors]);

  if (askForDesc) {
    return {
      key,
      topic: topicKey,
      text: `What does ${item.a} deal with?`,
      sub: "",
      options: optionItems.map(o => o.d),
      answer: item.d,
      correctLabel: item.a
    };
  } else {
    return {
      key,
      topic: topicKey,
      text: item.d,
      sub: "Which of these is this describing?",
      options: optionItems.map(o => o.a),
      answer: item.a,
      correctLabel: item.d
    };
  }
}

/* ============================================================
   STATE
   ============================================================ */
let state = {
  selectedTopics: new Set(),
  count: 20,
  perQTime: 0,
  wholeTime: 0,
  questions: [],
  idx: 0,
  score: 0,
  results: [],
  timerHandle: null,
  timeLeft: 0,
  wholeTimerHandle: null,
  wholeTimeLeft: 0,
  paused: false,
  startedAt: null,
  locked: false
};

/* ============================================================
   SETUP UI — topic chips
   ============================================================ */
const topicGrid = document.getElementById("topicGrid");
Object.entries(TOPIC_META).forEach(([key, t]) => {
  const chip = document.createElement("label");
  chip.className = "chip";
  chip.innerHTML = `
    <input type="checkbox" data-topic="${key}">
    <span class="tick"></span>
    <span class="chip-name">${t.label}</span>
    <span class="chip-eg">${t.eg}</span>
  `;
  chip.addEventListener("click", (e) => {
    e.preventDefault();
    const input = chip.querySelector("input");
    input.checked = !input.checked;
    chip.classList.toggle("checked", input.checked);
    if (input.checked) state.selectedTopics.add(key);
    else state.selectedTopics.delete(key);
    document.getElementById("hint").style.display = "none";
  });
  topicGrid.appendChild(chip);
});

function setupSegmented(id, stateKey, isNumber = true) {
  const seg = document.getElementById(id);
  seg.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state[stateKey] = isNumber ? Number(btn.dataset.val) : btn.dataset.val;
    });
  });
}
setupSegmented("countSeg", "count");
setupSegmented("timeSeg", "perQTime");
setupSegmented("wholeTimeSeg", "wholeTime");

document.getElementById("startBtn").addEventListener("click", () => {
  if (state.selectedTopics.size === 0) {
    document.getElementById("hint").style.display = "block";
    return;
  }
  beginQuiz();
});

/* ============================================================
   TICKER (hero decoration)
   ============================================================ */
(function buildTicker() {
  const bits = [];
  const pool = shuffle(QBANK.articles).slice(0, 24);
  pool.forEach(a => bits.push(`<span>${a.a} — ${a.d.slice(0, 46)}${a.d.length > 46 ? "…" : ""}</span>`));
  document.getElementById("tickerTrack").innerHTML = bits.join("");
})();

/* ============================================================
   QUIZ FLOW
   ============================================================ */
const setupView = document.getElementById("setupView");
const quizView = document.getElementById("quizView");
const resultsView = document.getElementById("resultsView");

function buildQuestionSet() {
  const usedKeysByTopic = {};
  const topics = Array.from(state.selectedTopics);
  topics.forEach(t => usedKeysByTopic[t] = new Set());
  const qs = [];
  for (let i = 0; i < state.count; i++) {
    const chosenTopic = topics[Math.floor(Math.random() * topics.length)];
    const pool = QBANK[chosenTopic];
    if (!pool || pool.length < 4) continue;
    const q = genMCQ(chosenTopic, pool, usedKeysByTopic[chosenTopic]);
    q.topicLabel = TOPIC_META[chosenTopic].label;
    qs.push(q);
  }
  return qs;
}

function beginQuiz() {
  state.questions = buildQuestionSet();
  state.idx = 0;
  state.score = 0;
  state.results = [];
  state.startedAt = Date.now();
  state.paused = false;
  setupView.style.display = "none";
  resultsView.style.display = "none";
  quizView.style.display = "block";
  document.getElementById("pauseOverlay").classList.remove("active");
  const tagEl = document.getElementById("quizTopicTag");
  tagEl.textContent = state.selectedTopics.size > 1
    ? "MIXED"
    : TOPIC_META[Array.from(state.selectedTopics)[0]].label.toUpperCase();

  const wholeDisplay = document.getElementById("wholeTimerDisplay");
  clearWholeTimer();
  if (state.wholeTime > 0) {
    state.wholeTimeLeft = state.wholeTime;
    wholeDisplay.style.display = "inline";
    updateWholeTimerDisplay();
    state.wholeTimerHandle = setInterval(() => {
      if (state.paused) return;
      state.wholeTimeLeft--;
      updateWholeTimerDisplay();
      if (state.wholeTimeLeft <= 0) {
        clearWholeTimer();
        finishTestNow();
      }
    }, 1000);
  } else {
    wholeDisplay.style.display = "none";
  }

  renderQuestion();
}

function updateWholeTimerDisplay() {
  const wholeDisplay = document.getElementById("wholeTimerDisplay");
  const m = Math.floor(state.wholeTimeLeft / 60);
  const s = state.wholeTimeLeft % 60;
  wholeDisplay.textContent = `Test time ${m}:${s.toString().padStart(2, "0")}`;
  wholeDisplay.classList.toggle("low", state.wholeTimeLeft <= 30);
}

function clearWholeTimer() {
  if (state.wholeTimerHandle) clearInterval(state.wholeTimerHandle);
  state.wholeTimerHandle = null;
}

function finishTestNow() {
  clearTimer();
  showResults();
}

function renderQuestion() {
  clearTimer();
  state.locked = false;
  const q = state.questions[state.idx];
  document.getElementById("qNumLabel").textContent = `Q${state.idx + 1} / ${state.questions.length}`;
  document.getElementById("quizScoreLive").textContent = `Score ${state.score}/${state.idx}`;
  document.getElementById("progressFill").style.width = `${(state.idx / state.questions.length) * 100}%`;
  document.getElementById("questionText").textContent = q.text;
  document.getElementById("questionSub").textContent = q.sub || (state.selectedTopics.size > 1 ? q.topicLabel : "");
  document.getElementById("feedback").textContent = "";
  document.getElementById("feedback").className = "feedback";

  const optRow = document.getElementById("optionsRow");
  optRow.innerHTML = "";
  q.options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => submitAnswer(opt, false));
    optRow.appendChild(btn);
  });

  const timerEl = document.getElementById("qTimer");
  if (state.perQTime > 0) {
    state.timeLeft = state.perQTime;
    timerEl.textContent = state.timeLeft + "s";
    timerEl.classList.remove("low");
    state.timerHandle = setInterval(() => {
      if (state.paused) return;
      state.timeLeft--;
      timerEl.textContent = state.timeLeft + "s";
      if (state.timeLeft <= 3) timerEl.classList.add("low");
      if (state.timeLeft <= 0) {
        clearTimer();
        submitAnswer(null, true);
      }
    }, 1000);
  } else {
    timerEl.textContent = "";
  }
}

function clearTimer() {
  if (state.timerHandle) clearInterval(state.timerHandle);
  state.timerHandle = null;
}

function submitAnswer(chosen, timedOut) {
  if (state.locked) return;
  state.locked = true;
  clearTimer();
  const q = state.questions[state.idx];
  const correct = !timedOut && chosen === q.answer;
  if (correct) state.score++;
  state.results.push({
    text: q.text, topicLabel: q.topicLabel,
    given: timedOut ? "(no answer)" : chosen,
    correctAnswer: q.answer, correct
  });

  // visually mark buttons
  const buttons = Array.from(document.querySelectorAll("#optionsRow .option-btn"));
  buttons.forEach(b => {
    b.disabled = true;
    if (b.textContent === q.answer) b.classList.add("opt-correct");
    else if (b.textContent === chosen) b.classList.add("opt-wrong");
  });

  const feedback = document.getElementById("feedback");
  if (correct) {
    feedback.textContent = "Correct!";
    feedback.className = "feedback correct";
  } else {
    feedback.textContent = `${timedOut ? "Time's up." : "Not quite."} Answer: ${q.answer}`;
    feedback.className = "feedback wrong";
  }

  setTimeout(() => {
    state.idx++;
    if (state.idx >= state.questions.length) {
      showResults();
    } else {
      renderQuestion();
    }
  }, 1000);
}

document.getElementById("skipBtn").addEventListener("click", () => submitAnswer(null, false));
document.getElementById("quitBtn").addEventListener("click", () => {
  clearTimer();
  clearWholeTimer();
  if (state.idx > 0) showResults();
  else { quizView.style.display = "none"; setupView.style.display = "block"; }
});

document.getElementById("pauseBtn").addEventListener("click", () => pauseTest());
document.getElementById("resumeBtn").addEventListener("click", () => resumeTest());

function pauseTest() {
  if (state.paused) return;
  state.paused = true;
  document.getElementById("pauseOverlay").classList.add("active");
}

function resumeTest() {
  state.paused = false;
  document.getElementById("pauseOverlay").classList.remove("active");
}

function showResults() {
  clearTimer();
  clearWholeTimer();
  quizView.style.display = "none";
  resultsView.style.display = "block";
  document.getElementById("scoreBig").textContent = `${state.score}/${state.results.length}`;
  const secs = Math.round((Date.now() - state.startedAt) / 1000);
  document.getElementById("scoreTime").textContent = `Completed in ${secs}s · avg ${(secs / Math.max(state.results.length,1)).toFixed(1)}s per question`;

  const list = document.getElementById("reviewList");
  list.innerHTML = "";
  state.results.forEach(r => {
    const row = document.createElement("div");
    row.className = "review-item" + (r.correct ? "" : " wrong");
    row.innerHTML = `
      <span class="q">${r.text} <span style="color:var(--chalk-dim)">(${r.topicLabel})</span></span>
      <span class="a">You: ${r.given} · Ans: ${r.correctAnswer}</span>
      <span class="badge ${r.correct ? "ok" : "no"}">${r.correct ? "OK" : "MISS"}</span>
    `;
    list.appendChild(row);
  });
}

document.getElementById("retryBtn").addEventListener("click", () => {
  resultsView.style.display = "none";
  setupView.style.display = "block";
});
document.getElementById("sameSetupBtn").addEventListener("click", () => {
  beginQuiz();
});

/* ============================================================
   TABS: Practice vs Study
   ============================================================ */
const tabPractice = document.getElementById("tabPractice");
const tabStudy = document.getElementById("tabStudy");
const studyView = document.getElementById("studyView");

tabPractice.addEventListener("click", () => {
  tabPractice.classList.add("active");
  tabStudy.classList.remove("active");
  studyView.style.display = "none";
  setupView.style.display = "block";
  quizView.style.display = "none";
  resultsView.style.display = "none";
});
tabStudy.addEventListener("click", () => {
  tabStudy.classList.add("active");
  tabPractice.classList.remove("active");
  setupView.style.display = "none";
  quizView.style.display = "none";
  resultsView.style.display = "none";
  studyView.style.display = "block";
});

/* ============================================================
   MANUAL ROTATE-VIEW TOGGLE
   Installed PWAs often ignore the device's rotation lock / the
   manifest's orientation hint, so this flips the whole page 90°
   with CSS as a manual "force landscape" switch.
   ============================================================ */
const rotateBtn = document.getElementById("rotateBtn");
if (rotateBtn) {
  rotateBtn.addEventListener("click", () => {
    document.documentElement.classList.toggle("force-landscape");
    window.scrollTo(0, 0);
  });
}
