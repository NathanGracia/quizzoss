const $ = id => document.getElementById(id)

const state = {
  topic: '',
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

// ── Quiz ──────────────────────────────────────────────────────────────────────

async function loadQuestion() {
  // Switch to quiz panel, show skeleton
  $('state-welcome').classList.add('hidden')
  $('state-quiz').classList.remove('hidden')
  $('q-skeleton').classList.remove('hidden')
  $('q-text').classList.add('hidden')
  $('answer-area').classList.add('hidden')
  $('result-area').classList.add('hidden')
  $('src-file').textContent = '…'
  $('src-section').textContent = ''

  const params = state.topic ? `?topic=${encodeURIComponent(state.topic)}` : ''
  const res = await fetch(`/api/question${params}`)

  if (!res.ok) {
    showQuestionError('Erreur lors du chargement. Réessaie.')
    return
  }

  const data = await res.json()
  state.chunk    = data.chunk
  state.question = data.question
  state.expected = data.expected

  // Source
  $('src-file').textContent    = data.chunk.source_file.split('/').pop().replace('.md', '')
  $('src-section').textContent = data.chunk.heading_path

  // Question
  $('q-skeleton').classList.add('hidden')
  $('q-text').textContent = data.question
  $('q-text').classList.remove('hidden')
  $('answer-area').classList.remove('hidden')

  $('answer-input').value = ''
  $('answer-input').focus()
}

function showQuestionError(msg) {
  $('q-skeleton').classList.add('hidden')
  $('q-text').textContent = msg
  $('q-text').classList.remove('hidden')
}

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

  $('result-card').className = `result-card ${cls}`
  $('result-card').innerHTML = `
    <div class="result-status ${cls}">${icon} ${result.statut ?? '?'}</div>
    ${result.explication ? `<div class="result-expl">${esc(result.explication)}</div>` : ''}
    <div class="result-source">→ ${esc(state.chunk.source_file)}</div>
  `
}

function handleKey(e) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    submitAnswer()
  }
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
