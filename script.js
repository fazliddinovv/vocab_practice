// 1. Supabase ulanishi
const SUPABASE_URL = "https://mnailfqtpdfrtosobhzg.supabase.co";
const SUPABASE_KEY = "sb_publishable__p90Eg45QchPn2Y8uGfWHg_NpevmB3p";

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const WORDS_PER_PART = 10;
const allVocab = {};
let vocabularyList = [];
let totalPartsCount = 0;

let currentPart = null, questions = [], currentIndex = 0, score = 0;
let answered = false, results = [];

// --- LOCAL STORAGE BILAN ISHLASH ---
function getLearnedWords() {
  const saved = localStorage.getItem('learned_words');
  return saved ? JSON.parse(saved) : [];
}

function saveLearnedWord(word) {
  let learned = getLearnedWords();
  const normalizedWord = normalize(word);
  if (!learned.includes(normalizedWord)) {
    learned.push(normalizedWord);
    localStorage.setItem('learned_words', JSON.stringify(learned));
  }
}

// 2. Ma'lumotlarni Supabase'dan olish
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

// Global Enter tugmasi
document.addEventListener('keydown', function(e) {
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

function showPartSelector() {
  document.getElementById('startScreen').classList.add('hidden');
  document.getElementById('partSelectorScreen').classList.remove('hidden');
  const sel = document.getElementById('partSelector');
  sel.innerHTML = '';
  
  const learnedWords = getLearnedWords();

  for (let i = 1; i <= totalPartsCount; i++) {
    const btn = document.createElement('button');
    btn.className = 'part-btn';
    const partWords = allVocab['part' + i] || [];
    
    // Part ichida nechta so'z yodlanganini hisoblash
    const learnedInPart = partWords.filter(q => learnedWords.includes(normalize(q.word))).length;

    btn.innerHTML = `Part ${i} <span style="float:right; opacity:0.8; font-size:12px;">${learnedInPart}/${partWords.length} learned</span>`;
    btn.onclick = () => startPart(i);
    sel.appendChild(btn);
  }
}

function backToStart() {
  document.getElementById('partSelectorScreen').classList.add('hidden');
  document.getElementById('startScreen').classList.remove('hidden');
}

function exitQuizToParts() {
  document.getElementById('quizScreen').classList.add('hidden');
  showPartSelector();
}

function startPart(n) {
  currentPart = n;
  questions = [...allVocab[`part${n}`]];
  currentIndex = 0; score = 0; results = []; answered = false;
  document.getElementById('partSelectorScreen').classList.add('hidden');
  document.getElementById('quizScreen').classList.remove('hidden');
  document.getElementById('resultsScreen').classList.add('hidden');
  showQuestion();
}

function showQuestion() {
  const q = questions[currentIndex];
  const learnedWords = getLearnedWords();
  const isAlreadyLearned = learnedWords.includes(normalize(q.word));

  // Agar so'z avval yodlangan bo'lsa, indicator ko'rsatish
  const statusBadge = isAlreadyLearned ? `<span style="color:#10b981; font-size:12px; display:block; margin-bottom:5px;">✓ Mastered before</span>` : '';
  
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

function checkAnswer() {
  if (answered) { nextQuestion(); return; }
  
  const inp = document.getElementById('answerInput');
  const userAns = normalize(inp.value);
  const correct = normalize(questions[currentIndex].word);
  
  answered = true;
  inp.disabled = true;
  const isCorrect = userAns === correct;
  
  if (isCorrect) {
    score++;
    saveLearnedWord(questions[currentIndex].word); // <--- SO'Z LOCALSTORAGE'GA SAQLANADI
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
  startPart(currentPart);
}

function backToPartSelector() {
  document.getElementById('resultsScreen').classList.add('hidden');
  showPartSelector();
}

// Dastur ishga tushishi
fetchVocabulary();