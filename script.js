// 1. Supabase ulanishi (CDN orqali to'g'ri olish)
const SUPABASE_URL = "https://mnailfqtpdfrtosobhzg.supabase.co";
const SUPABASE_KEY = "sb_publishable__p90Eg45QchPn2Y8uGfWHg_NpevmB3p";

// window.supabase yoki window.supabase.createClient ni xavfsiz aniqlash
const supabaseLib = window.supabaseClient || window.supabase;
const supabaseClient = supabaseLib && supabaseLib.createClient
  ? supabaseLib.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const WORDS_PER_PART = 10;
const EXPIRATION_TIME = 10 * 24 * 60 * 60 * 1000; // 10 kun

const allVocab = {};
let vocabularyList = [];
let totalPartsCount = 0;

let currentPart = null, questions = [], currentIndex = 0, score = 0;
let answered = false, results = [];
let isReviewMode = false;

// --- GOOGLE AUTHENTICATION & USER MANAGEMENT ---
async function loginWithGoogle(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.href
    }
  });
  if (error) console.error("Kirishda xatolik:", error.message);
}

async function logout() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  window.location.reload();
}

async function checkUser() {
  if (!supabaseClient) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  const authModal = document.getElementById('auth-modal');
  const loggedOutView = document.getElementById('logged-out-view');
  const loggedInView = document.getElementById('logged-in-view');
  const userName = document.getElementById('user-name');
  const userAvatar = document.getElementById('user-avatar');

  if (session) {
    const user = session.user;
    if (loggedOutView) loggedOutView.classList.add('hidden');
    if (loggedInView) loggedInView.classList.remove('hidden');
    if (userName) userName.textContent = user.user_metadata?.full_name || user.email || 'Foydalanuvchi';
    if (userAvatar) userAvatar.src = user.user_metadata?.avatar_url || '';
    if (authModal) authModal.classList.add('hidden');
  } else {
    if (loggedOutView) loggedOutView.classList.remove('hidden');
    if (loggedInView) loggedInView.classList.add('hidden');
  }
}

// --- SUPABASE PROGRESS (10 KUNLIK TAYMER) ---
async function getWordStatus() {
  if (!supabaseClient) return { valid: [], expired: [] };

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return { valid: [], expired: [] };

  const { data, error } = await supabaseClient
    .from('user_progress')
    .select('word, learned_at')
    .eq('user_id', user.id);

  if (error || !data) return { valid: [], expired: [] };

  const now = Date.now();
  const valid = [];
  const expired = [];

  data.forEach(item => {
    if (now - item.learned_at < EXPIRATION_TIME) {
      valid.push(item.word);
    } else {
      expired.push(item.word);
    }
  });

  return { valid, expired };
}

async function saveLearnedWord(word) {
  if (!supabaseClient) return;

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const normalizedWord = normalize(word);

  await supabaseClient
    .from('user_progress')
    .upsert({
      user_id: user.id,
      word: normalizedWord,
      learned_at: Date.now()
    }, { onConflict: 'user_id, word' });
}

// 2. Supabase ma'lumotlarini olish
async function fetchVocabulary() {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient
    .from('vocabulary')
    .select('word, definition')
    .order('id', { ascending: true });

  if (error) {
    console.error("Xatolik:", error);
    return;
  }

  vocabularyList = data;
  const countEl = document.getElementById('totalWordsCount');
  if (countEl) countEl.textContent = vocabularyList.length;
  createParts();
}

function createParts() {
  totalPartsCount = Math.ceil(vocabularyList.length / WORDS_PER_PART);
  for (let key in allVocab) delete allVocab[key];

  for (let i = 0; i < totalPartsCount; i++) {
    const start = i * WORDS_PER_PART;
    const end = start + WORDS_PER_PART;
    allVocab[`part${i + 1}`] = vocabularyList.slice(start, end);
  }
}

// Global Enter
document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    const quizScreen = document.getElementById('quizScreen');
    if (quizScreen && !quizScreen.classList.contains('hidden')) {
      e.preventDefault();
      if (!answered) checkAnswer();
      else nextQuestion();
    }
  }
});

function normalize(str) {
  return str ? str.trim().toLowerCase().replace(/['']/g, "'").replace(/\s+/g, " ") : "";
}

async function showPartSelector() {
  document.getElementById('startScreen').classList.add('hidden');
  document.getElementById('partSelectorScreen').classList.remove('hidden');
  const sel = document.getElementById('partSelector');
  sel.innerHTML = '';

  const status = await getWordStatus();
  const learnedWords = status.valid;
  const expiredWords = status.expired;

  const reviewBtn = document.getElementById('reviewQuizBtn');
  const reviewCount = document.getElementById('reviewCount');
  if (reviewBtn && expiredWords.length > 0) {
    reviewBtn.style.display = 'block';
    reviewCount.textContent = expiredWords.length;
  } else if (reviewBtn) {
    reviewBtn.style.display = 'none';
  }

  for (let i = 1; i <= totalPartsCount; i++) {
    const btn = document.createElement('button');
    btn.className = 'part-btn';
    const partWords = allVocab['part' + i] || [];

    const learnedInPart = partWords.filter(q => learnedWords.includes(normalize(q.word))).length;

    btn.innerHTML = `Part ${i} <span style="float:right; opacity:0.8; font-size:12px;">${learnedInPart}/${partWords.length} learned</span>`;
    btn.onclick = () => startPart(i);
    sel.appendChild(btn);
  }
}

async function startReviewQuiz() {
  const status = await getWordStatus();
  const expiredWords = status.expired;

  questions = vocabularyList.filter(item => expiredWords.includes(normalize(item.word)));

  if (questions.length === 0) return;

  isReviewMode = true;
  currentIndex = 0; score = 0; results = []; answered = false;

  document.getElementById('partSelectorScreen').classList.add('hidden');
  document.getElementById('quizScreen').classList.remove('hidden');
  document.getElementById('resultsScreen').classList.add('hidden');
  await showQuestion();
}

function backToStart() {
  document.getElementById('partSelectorScreen').classList.add('hidden');
  document.getElementById('startScreen').classList.remove('hidden');
}

function exitQuizToParts() {
  document.getElementById('quizScreen').classList.add('hidden');
  showPartSelector();
}

async function startPart(n) {
  isReviewMode = false;
  currentPart = n;
  questions = [...allVocab[`part${n}`]];
  currentIndex = 0; score = 0; results = []; answered = false;
  document.getElementById('partSelectorScreen').classList.add('hidden');
  document.getElementById('quizScreen').classList.remove('hidden');
  document.getElementById('resultsScreen').classList.add('hidden');
  await showQuestion();
}

async function showQuestion() {
  const q = questions[currentIndex];
  const status = await getWordStatus();
  const isAlreadyLearned = status.valid.includes(normalize(q.word));

  let statusBadge = '';
  if (isReviewMode) {
    statusBadge = `<span style="color:#ef4444; font-size:12px; display:block; margin-bottom:5px;">⚠️ Needs Review (10+ days)</span>`;
  } else if (isAlreadyLearned) {
    statusBadge = `<span style="color:#10b981; font-size:12px; display:block; margin-bottom:5px;">✓ Mastered (Active)</span>`;
  }

  document.getElementById('definition').innerHTML = statusBadge + q.definition;
  document.getElementById('counter').textContent = `${currentIndex + 1} / ${questions.length}`;
  document.getElementById('score').textContent = `Score: ${score}`;
  document.getElementById('progressBar').style.width = `${(currentIndex / questions.length) * 100}%`;

  const inp = document.getElementById('answerInput');
  inp.value = ''; inp.className = ''; inp.disabled = false;

  const fb = document.getElementById('feedback');
  fb.className = 'hidden';
  fb.style.display = 'none';

  document.getElementById('submitBtn').textContent = 'Submit Answer';
  answered = false;
  setTimeout(() => inp.focus(), 50);
}

async function checkAnswer() {
  if (answered) { nextQuestion(); return; }

  const inp = document.getElementById('answerInput');
  const userAns = normalize(inp.value);
  const correct = normalize(questions[currentIndex].word);

  answered = true;
  inp.disabled = true;
  const isCorrect = userAns === correct;

  if (isCorrect) {
    score++;
    await saveLearnedWord(questions[currentIndex].word);
  }

  results.push({
    definition: questions[currentIndex].definition,
    correct: questions[currentIndex].word,
    userAnswer: inp.value,
    isCorrect
  });

  inp.classList.add(isCorrect ? 'correct' : 'wrong');
  const fb = document.getElementById('feedback');
  fb.style.display = 'block';
  fb.className = 'feedback ' + (isCorrect ? 'correct' : 'wrong');

  if (isCorrect) {
    fb.innerHTML = `<div class="feedback-title">✓ Correct!</div><div class="feedback-detail">Excellent word recall.</div>`;
  } else {
    fb.innerHTML = `<div class="feedback-title">✗ Incorrect</div><div class="feedback-detail">Target answer: <strong style="color:#38bdf8">${questions[currentIndex].word}</strong></div>`;
  }

  document.getElementById('submitBtn').textContent = currentIndex + 1 === questions.length ? 'See Final Results →' : 'Next Question →';
}

function nextQuestion() {
  currentIndex++;
  if (currentIndex >= questions.length) { showResults(); return; }
  showQuestion();
}

function showResults() {
  document.getElementById('quizScreen').classList.add('hidden');
  document.getElementById('resultsScreen').classList.remove('hidden');

  const pct = Math.round((score / questions.length) * 100);
  const grade = pct >= 90 ? 'Mastered!' : pct >= 70 ? 'Great job!' : pct >= 50 ? 'Good Effort!' : 'Needs Practice!';
  const color = pct >= 90 ? '#10b981' : pct >= 70 ? '#38bdf8' : pct >= 50 ? '#f59e0b' : '#ef4444';

  document.getElementById('gradeLabel').textContent = grade;
  document.getElementById('gradeLabel').style.color = color;
  document.getElementById('percentScore').textContent = pct + '%';
  document.getElementById('resultsSummary').textContent = `${score} out of ${questions.length} correct`;

  const bar = document.getElementById('resultsBar');
  if (bar) {
    bar.style.background = color;
    setTimeout(() => bar.style.width = pct + '%', 100);
  }

  const list = document.getElementById('resultsList');
  list.className = 'results-scroll-container';

  list.innerHTML = results.map(r => `
    <div class="result-item ${r.isCorrect ? '' : 'wrong'}">
      <div class="result-definition">${r.definition}</div>
      <div class="result-answers-group">
        <span class="result-target">✓ ${r.correct}</span>
        ${!r.isCorrect ? `<span class="result-user-wrong">✗ ${r.userAnswer || '(empty)'}</span>` : ''}
      </div>
    </div>`).join('');
}

function retryPart() {
  if (isReviewMode) startReviewQuiz();
  else startPart(currentPart);
}

function backToPartSelector() {
  document.getElementById('resultsScreen').classList.add('hidden');
  showPartSelector();
}

// DOM YUKLANGANIDAN SO'NG HODISALARNI BIRIKTIRISH
document.addEventListener('DOMContentLoaded', () => {
  checkUser();
  fetchVocabulary();

  const authModal = document.getElementById('auth-modal');
  const openAuthBtn = document.getElementById('open-auth-btn');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const googleLoginBtn = document.getElementById('google-login-btn');
  const logoutBtn = document.getElementById('logout-btn');

  // Modalni ochish
  if (openAuthBtn) {
    openAuthBtn.addEventListener('click', () => {
      if (authModal) {
        authModal.classList.remove('hidden');
        authModal.style.display = 'flex'; // Ko'rsatishni kafolatlash
      }
    });
  }

  // X tugmasi orqali yopish
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (authModal) {
        authModal.classList.add('hidden');
        authModal.style.display = 'none'; // Yopishni kafolatlash
      }
    });
  }

  // Tashqariga bosilganda yopish
  if (authModal) {
    authModal.addEventListener('click', (e) => {
      if (e.target === authModal) {
        authModal.classList.add('hidden');
        authModal.style.display = 'none';
      }
    });
  }

  if (googleLoginBtn) googleLoginBtn.addEventListener('click', loginWithGoogle);
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
});