const $ = id => document.getElementById(id)

const state = {
  topic: '',
  session: [],
  index: 0,
  score: 0,
  chunk: null,
  question: null,
  expected: null,
  chatHistory: [],
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const res = await fetch('/api/topics')
  const { topics } = await res.json()
  const sel = $('topic-select')
  topics.forEach(t => {
    const opt = document.createElement('option')
    opt.value = t
    opt.textContent = t.split('/').pop().replace('.md', '')
    sel.appendChild(opt)
  })
  sel.addEventListener('change', () => { state.topic = sel.value })
}

// ── Session ───────────────────────────────────────────────────────────────────

async function startSession() {
  $('state-welcome').classList.add('hidden')
  $('state-end').classList.add('hidden')
  $('state-quiz').classList.remove('hidden')
  showQuizSkeleton()

  const params = new URLSearchParams({ count: 10 })
  if (state.topic) params.set('topic', state.topic)
  const res = await fetch(`/api/session?${params}`)

  if (!res.ok) {
    showQuestionError('Erreur lors du chargement. Réessaie.')
    return
  }

  const data = await res.json()
  state.session = data.questions
  state.index = 0
  state.score = 0
  showQuestion(0)
}

function showQuestion(i) {
  const q = state.session[i]
  state.index = i
  state.chunk = q.chunk
  state.question = q.question
  state.expected = q.expected
  state.chatHistory = []

  const total = state.session.length
  $('q-progress').textContent = `Question ${i + 1} / ${total}`
  $('q-score').textContent = `${state.score} ✓`
  $('progress-fill').style.width = `${(i / total) * 100}%`

  $('src-file').textContent = q.chunk.source_file.split('/').pop().replace('.md', '')
  $('src-section').textContent = q.chunk.heading_path

  $('q-skeleton').classList.add('hidden')
  $('q-text').textContent = q.question
  $('q-text').classList.remove('hidden')
  $('answer-area').classList.remove('hidden')
  $('result-area').classList.add('hidden')

  $('answer-input').value = ''
  $('answer-input').focus()
}

function showQuizSkeleton() {
  $('q-skeleton').classList.remove('hidden')
  $('q-text').classList.add('hidden')
  $('answer-area').classList.add('hidden')
  $('result-area').classList.add('hidden')
  $('src-file').textContent = '…'
  $('src-section').textContent = ''
}

function showQuestionError(msg) {
  $('q-skeleton').classList.add('hidden')
  $('q-text').textContent = msg
  $('q-text').classList.remove('hidden')
}

function skipQuestion() {
  const isLast = state.index >= state.session.length - 1
  if (isLast) showEndScreen()
  else showQuestion(state.index + 1)
}

// ── Quiz ──────────────────────────────────────────────────────────────────────

async function submitAnswer() {
  const answer = $('answer-input').value.trim()
  if (!answer || !state.chunk) return

  $('answer-area').classList.add('hidden')
  $('result-area').classList.remove('hidden')
  $('result-card').className = 'result-card'
  $('result-card').innerHTML = `<div style="color:var(--muted);font-size:.875rem">Évaluation en cours…</div>`

  const res = await fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question:    state.question,
      expected:    state.expected,
      user_answer: answer,
      source_file: state.chunk.source_file,
      heading_path: state.chunk.heading_path,
    }),
  })

  const result = await res.json()
  const ok  = result.statut?.toLowerCase().includes('réussi')
  const cls = ok ? 'ok' : 'err'
  const icon = ok ? '✓' : '✗'

  if (ok) state.score++
  $('q-score').textContent = `${state.score} ✓`

  const isLast = state.index >= state.session.length - 1

  $('result-card').className = `result-card ${cls}`
  $('result-card').innerHTML = `
    <div class="result-status ${cls}">${icon} ${result.statut ?? '?'}</div>
    ${result.explication ? `<div class="result-expl">${esc(result.explication)}</div>` : ''}
    <div class="result-source">→ ${esc(state.chunk.source_file)}</div>
  `

  const nextBtn = $('next-btn')
  nextBtn.textContent = isLast ? 'Voir les résultats →' : 'Question suivante →'
  nextBtn.onclick = isLast ? showEndScreen : () => showQuestion(state.index + 1)
}

function handleKey(e) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    submitAnswer()
  }
}

// ── End screen ────────────────────────────────────────────────────────────────

function showEndScreen() {
  $('state-quiz').classList.add('hidden')
  $('state-end').classList.remove('hidden')

  const total = state.session.length
  const score = state.score
  const pct = Math.round((score / total) * 100)

  $('end-score').textContent = `${score} / ${total}`
  $('end-bar').style.width = `${pct}%`

  let title, msg
  if (pct >= 80)      { title = 'Excellent !';   msg = 'Tu maîtrises bien le sujet.' }
  else if (pct >= 60) { title = 'Bien joué !';   msg = 'Continue comme ça.' }
  else if (pct >= 40) { title = 'Pas mal !';     msg = 'Encore un peu de révision et tu y es.' }
  else                { title = 'À réviser.';    msg = 'Relis tes notes et retente !' }

  $('end-title').textContent = title
  $('end-msg').textContent = msg
}

// ── Chat ──────────────────────────────────────────────────────────────────────

function openChat() {
  if (!state.chunk) return
  state.chatHistory = []
  $('chat-sub').textContent = state.chunk.heading_path

  $('chat-msgs').innerHTML = `
    <div class="msg bot">
      Bonjour ! Je suis ton tuteur pour la section
      <strong>${esc(state.chunk.heading_path)}</strong>. Pose-moi tes questions.
    </div>
  `
  $('chat-backdrop').classList.remove('hidden')
  $('chat-drawer').classList.remove('hidden')
  setTimeout(() => $('chat-input').focus(), 50)
}

function closeChat() {
  $('chat-backdrop').classList.add('hidden')
  $('chat-drawer').classList.add('hidden')
}

async function sendChat() {
  const input = $('chat-input')
  const msg   = input.value.trim()
  if (!msg || !state.chunk) return
  input.value = ''

  const msgs = $('chat-msgs')
  msgs.innerHTML += `<div class="msg user">${esc(msg)}</div>`

  const typingId = 'typing-' + Date.now()
  msgs.innerHTML += `
    <div class="msg typing" id="${typingId}">
      <div class="dot"></div><div class="dot"></div><div class="dot"></div>
    </div>
  `
  msgs.scrollTop = msgs.scrollHeight

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_file:  state.chunk.source_file,
      heading_path: state.chunk.heading_path,
      history:      state.chatHistory,
      message:      msg,
    }),
  })

  const data = await res.json()
  document.getElementById(typingId)?.remove()

  const html = typeof marked !== 'undefined'
    ? marked.parse(data.response)
    : esc(data.response)

  msgs.innerHTML += `<div class="msg bot">${html}</div>`
  msgs.scrollTop = msgs.scrollHeight

  state.chatHistory.push({ role: 'user',  text: msg })
  state.chatHistory.push({ role: 'model', text: data.response })
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendChat()
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

init()
