const $ = id => document.getElementById(id)

const state = {
  topic: '',
  session: [],
  index: 0,
  score: 0,
  chunk: null,
  question: null,
  expected: null,
  userAnswer: null,
  evalResult: null,
  chatHistory: [],
  history: [],  // { chunk, question, expected, userAnswer, evalResult, chatHistory }
}

let _currentNoteFile = null
let _currentNoteMd   = ''
let _editMode        = false
let _lastMainState   = 'home'  // 'home' | 'quiz' | 'end'

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

  const { note, section } = _getUrlParams()
  if (note) {
    await _renderNote(note, section)
  } else {
    $('state-home').classList.remove('hidden')
    loadLibrary()
  }
}

// ── Routing ───────────────────────────────────────────────────────────────────

function _getUrlParams() {
  const p = new URLSearchParams(location.search)
  return {
    note:    p.get('note') || null,
    section: p.get('section') || null,
  }
}

function _pushUrl(params) {
  const sp = new URLSearchParams()
  if (params.note) sp.set('note', params.note)
  if (params.section) sp.set('section', params.section)
  const qs = sp.toString()
  history.pushState(params, '', qs ? `?${qs}` : location.pathname)
}

window.addEventListener('popstate', () => {
  const { note, section } = _getUrlParams()
  if (note) {
    _renderNote(note, section)
  } else {
    _restoreMainView()
  }
})

function _restoreMainView() {
  document.querySelectorAll('.state').forEach(s => s.classList.add('hidden'))
  if (_lastMainState === 'quiz') {
    $('state-quiz').classList.remove('hidden')
  } else if (_lastMainState === 'end') {
    $('state-end').classList.remove('hidden')
  } else {
    $('state-home').classList.remove('hidden')
  }
}

function goHome() {
  _lastMainState = 'home'
  const { note } = _getUrlParams()
  if (note) _pushUrl({})
  document.querySelectorAll('.state').forEach(s => s.classList.add('hidden'))
  $('state-home').classList.remove('hidden')
  loadLibrary()
}

// ── Session ───────────────────────────────────────────────────────────────────

async function startSession() {
  _lastMainState = 'quiz'
  $('state-home').classList.add('hidden')
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
  state.history = []
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
  $('src-file').onclick = () => openNote(q.chunk.source_file, q.chunk.heading_path)

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
  state.userAnswer = answer

  $('answer-area').classList.add('hidden')
  $('inline-chat').classList.add('hidden')
  $('inline-msgs').innerHTML = ''
  $('inline-input').value = ''
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

  if (!res.ok) {
    $('result-card').className = 'result-card err'
    $('result-card').innerHTML = `<div class="result-status err">✗ Erreur LLM — réessaie</div>`
    const nextBtn = $('next-btn')
    const isLast2 = state.index >= state.session.length - 1
    nextBtn.textContent = isLast2 ? 'Voir les résultats →' : 'Question suivante →'
    nextBtn.onclick = isLast2 ? showEndScreen : () => showQuestion(state.index + 1)
    return
  }

  const result = await res.json()
  state.evalResult = result
  state.history.push({
    chunk: state.chunk,
    question: state.question,
    expected: state.expected,
    userAnswer: state.userAnswer,
    evalResult: result,
    chatHistory: [],
  })
  const statut = result.statut?.toLowerCase() ?? ''
  const ok   = statut.includes('réussi')
  const half = statut.includes('incomplet')
  const cls  = ok ? 'ok' : half ? 'half' : 'err'
  const icon = ok ? '✓' : half ? '◑' : '✗'

  if (ok) state.score++
  $('q-score').textContent = `${state.score} ✓`

  const isLast = state.index >= state.session.length - 1

  $('result-card').className = `result-card ${cls}`
  $('result-card').innerHTML = `
    <div class="result-status ${cls}">${icon} ${result.statut ?? '?'}</div>
    ${result.explication ? `<div class="result-expl">${esc(result.explication)}</div>` : ''}
    ${result.reponse_ideale ? `<div class="result-ideal"><span class="result-ideal-label">Réponse idéale</span>${esc(result.reponse_ideale)}</div>` : ''}
    <div class="result-source note-link" id="result-source-link">→ ${esc(state.chunk.source_file)}</div>
  `

  const srcLink = $('result-source-link')
  if (srcLink) srcLink.onclick = () => _openNoteNewTab(state.chunk.source_file, state.chunk.heading_path)

  state.chatHistory = []
  $('inline-chat').classList.remove('hidden')

  const nextBtn = $('next-btn')
  nextBtn.textContent = isLast ? 'Voir les résultats →' : 'Question suivante →'
  nextBtn.onclick = isLast ? showEndScreen : () => showQuestion(state.index + 1)
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submitAnswer()
  }
}

// ── End screen ────────────────────────────────────────────────────────────────

function showEndScreen() {
  _lastMainState = 'end'
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
  _buildRecap()
}

function _buildRecap() {
  const recap = $('end-recap')
  recap.innerHTML = state.history.length
    ? `<h2 class="recap-title">Récapitulatif</h2>`
    : ''

  state.history.forEach((item, i) => {
    const { chunk, question, userAnswer, evalResult } = item
    const statut = evalResult?.statut?.toLowerCase() ?? ''
    const ok   = statut.includes('réussi')
    const half = statut.includes('incomplet')
    const cls  = ok ? 'ok' : half ? 'half' : 'err'
    const icon = ok ? '✓' : half ? '◑' : '✗'

    const div = document.createElement('div')
    div.className = 'recap-item'
    div.innerHTML = `
      <div class="recap-header">
        <span class="recap-num">Q${i + 1}</span>
        <span class="recap-source">${esc(chunk.source_file.split('/').pop().replace('.md',''))} › ${esc(chunk.heading_path.split(' > ').pop())}</span>
        <span class="result-status ${cls}" style="margin-left:auto;font-size:.75rem">${icon} ${esc(evalResult?.statut ?? '?')}</span>
      </div>
      <div class="recap-question">${esc(question)}</div>
      <div class="recap-answer">
        <span class="recap-answer-label">Ta réponse</span>
        ${esc(userAnswer || '—')}
      </div>
      ${evalResult ? `<div class="result-card ${cls}" style="border:none;border-top:var(--stroke) solid var(--dim);box-shadow:none">
        ${evalResult.explication ? `<div class="result-expl">${esc(evalResult.explication)}</div>` : ''}
        ${evalResult.reponse_ideale ? `<div class="result-ideal"><span class="result-ideal-label">Réponse idéale</span>${esc(evalResult.reponse_ideale)}</div>` : ''}
      </div>` : ''}
      <div class="inline-chat" style="border-top:var(--stroke) solid var(--dim)">
        <div class="inline-msgs" id="recap-msgs-${i}"></div>
        <div class="inline-chat-row">
          <textarea class="inline-input" id="recap-input-${i}" rows="1"
            placeholder="Poser une question sur cette correction…"
            onkeydown="handleRecapKey(event,${i})"></textarea>
          <button class="btn btn-primary" onclick="sendRecapChat(${i})">→</button>
        </div>
      </div>
    `
    recap.appendChild(div)
  })
}

async function sendRecapChat(idx) {
  const item = state.history[idx]
  const input = document.getElementById(`recap-input-${idx}`)
  const msgs  = document.getElementById(`recap-msgs-${idx}`)
  const msg   = input.value.trim()
  if (!msg || !item) return
  input.value = ''

  msgs.innerHTML += `<div class="imsg user">${esc(msg)}</div>`
  const typingId = 'typing-' + Date.now()
  msgs.innerHTML += `<div class="imsg typing" id="${typingId}"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`
  msgs.scrollTop = msgs.scrollHeight

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_file:  item.chunk.source_file,
      heading_path: item.chunk.heading_path,
      question:     item.question,
      user_answer:  item.userAnswer,
      eval_result:  item.evalResult,
      history:      item.chatHistory,
      message:      msg,
    }),
  })

  const data = await res.json()
  document.getElementById(typingId)?.remove()
  const html = typeof marked !== 'undefined' ? marked.parse(data.response) : esc(data.response)
  msgs.innerHTML += `<div class="imsg bot">${html}</div>`
  msgs.scrollTop = msgs.scrollHeight

  item.chatHistory.push({ role: 'user',  text: msg })
  item.chatHistory.push({ role: 'model', text: data.response })
}

function handleRecapKey(e, idx) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendRecapChat(idx) }
}

// ── Chat inline ───────────────────────────────────────────────────────────────

async function sendInlineChat() {
  const input = $('inline-input')
  const msg   = input.value.trim()
  if (!msg || !state.chunk) return
  input.value = ''

  const msgs = $('inline-msgs')
  msgs.innerHTML += `<div class="imsg user">${esc(msg)}</div>`

  const typingId = 'typing-' + Date.now()
  msgs.innerHTML += `
    <div class="imsg typing" id="${typingId}">
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
      question:     state.question,
      user_answer:  state.userAnswer,
      eval_result:  state.evalResult,
      history:      state.chatHistory,
      message:      msg,
    }),
  })

  const data = await res.json()
  document.getElementById(typingId)?.remove()

  const html = typeof marked !== 'undefined'
    ? marked.parse(data.response)
    : esc(data.response)

  msgs.innerHTML += `<div class="imsg bot">${html}</div>`
  msgs.scrollTop = msgs.scrollHeight

  state.chatHistory.push({ role: 'user',  text: msg })
  state.chatHistory.push({ role: 'model', text: data.response })
}

function handleInlineKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendInlineChat()
  }
}

// ── Library ───────────────────────────────────────────────────────────────────

async function loadLibrary() {
  const list = $('library-list')
  if (list.dataset.loaded) return
  list.innerHTML = `<div style="color:var(--muted);padding:1rem">Chargement…</div>`

  const res = await fetch('/api/library')
  const { files } = await res.json()

  const groups = {}
  for (const file of files) {
    const parts = file.split('/')
    const name = parts.pop()
    const folder = parts.join('/') || '—'
    if (!groups[folder]) groups[folder] = []
    groups[folder].push({ name, path: file })
  }

  list.innerHTML = ''
  for (const [folder, items] of Object.entries(groups).sort()) {
    const section = document.createElement('div')
    section.className = 'lib-section'

    const header = document.createElement('div')
    header.className = 'lib-folder'
    header.textContent = folder
    section.appendChild(header)

    const grid = document.createElement('div')
    grid.className = 'lib-files-grid'
    for (const f of items) {
      const el = document.createElement('div')
      el.className = 'lib-file'
      el.textContent = f.name.replace('.md', '')
      el.addEventListener('click', () => openNote(f.path))
      grid.appendChild(el)
    }
    section.appendChild(grid)
    list.appendChild(section)
  }

  list.dataset.loaded = '1'
}

// ── Rebuild ───────────────────────────────────────────────────────────────────

let _rebuildPoll = null

async function triggerRebuild() {
  let pwd = sessionStorage.getItem('edit_pwd')
  if (!pwd) {
    pwd = prompt('Mot de passe admin :')
    if (!pwd) return
    sessionStorage.setItem('edit_pwd', pwd)
  }

  const btn = $('rebuild-btn')
  const status = $('rebuild-status')

  btn.disabled = true
  status.textContent = 'Lancement…'

  const res = await fetch('/api/rebuild', {
    method: 'POST',
    headers: { 'X-Edit-Password': pwd },
  })

  if (res.status === 401) {
    sessionStorage.removeItem('edit_pwd')
    btn.disabled = false
    status.textContent = ''
    alert('Mot de passe incorrect.')
    return
  }
  if (res.status === 409) {
    btn.disabled = false
    status.textContent = 'Déjà en cours…'
    return
  }
  if (!res.ok) {
    btn.disabled = false
    const err = await res.json().catch(() => ({}))
    status.textContent = `✗ ${err.detail || res.status}`
    return
  }

  status.textContent = 'Scan…'
  _rebuildPoll = setInterval(_pollRebuild, 2000)
}

async function _pollRebuild() {
  const res = await fetch('/api/rebuild/status')
  const data = await res.json()
  const status = $('rebuild-status')
  const btn = $('rebuild-btn')

  if (data.running) {
    status.textContent = 'Génération…'
    return
  }

  clearInterval(_rebuildPoll)
  btn.disabled = false

  if (data.error) {
    status.textContent = `✗ ${data.error}`
    return
  }

  if (data.result) {
    const { new: n, removed, total } = data.result
    status.textContent = `✓ +${n} / -${removed} (${total} total)`
    $('library-list').removeAttribute('data-loaded')
    loadLibrary()
  }
}

function _openNoteNewTab(file, section) {
  const sp = new URLSearchParams()
  sp.set('note', file)
  if (section) sp.set('section', section)
  window.open(`?${sp.toString()}`, '_blank')
}

// ── Note viewer ───────────────────────────────────────────────────────────────

function _extractBlock(md, blockId) {
  const lines = md.split('\n')
  const anchorRe = new RegExp(`\\^${blockId}\\s*$`)
  for (let i = 0; i < lines.length; i++) {
    if (!anchorRe.test(lines[i])) continue
    const content = lines[i].replace(anchorRe, '').trim()
    if (content) return content
    // Standalone anchor line — collect preceding paragraph
    const block = []
    let j = i - 1
    while (j >= 0 && lines[j].trim() !== '') { block.unshift(lines[j]); j-- }
    return block.join('\n').trim() || null
  }
  return null
}

function preprocessMd(md) {
  const src = md
  // Same-file block embeds: ![[#^block-id]]
  md = md.replace(/!\[\[#\^([\w-]+)\]\]/g, (_, blockId) => {
    const block = _extractBlock(src, blockId)
    return block != null ? block : `*[embed introuvable : ^${blockId}]*`
  })
  // Wiki-link images: ![[file.png]] or ![[file.png|alt]]
  md = md.replace(/!\[\[([^\]#|]+)(?:\|[^\]]+)?\]\]/g, (_, s) => `![](${s.trim()})`)
  md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, s) => {
    if (/^https?:\/\//.test(s)) return match
    return `![${alt}](/api/asset?file=${encodeURIComponent(s.trim())})`
  })
  return md
}

async function openNote(file, section) {
  _pushUrl({ note: file, section: section || undefined })
  await _renderNote(file, section)
}

async function _renderNote(file, section) {
  _editMode = false
  _currentNoteFile = file
  document.querySelectorAll('.state').forEach(s => s.classList.add('hidden'))
  $('state-note').classList.remove('hidden')
  $('note-view-title').textContent = file.split('/').pop().replace('.md', '')
  $('note-view-body').innerHTML = `<p style="color:var(--muted)">Chargement…</p>`
  $('note-view-body').classList.remove('hidden')
  $('note-edit-area').classList.add('hidden')
  $('edit-btn').textContent = 'Modifier'

  const res = await fetch(`/api/note?file=${encodeURIComponent(file)}`)
  if (!res.ok) {
    $('note-view-body').innerHTML = `<p style="color:var(--err)">Note introuvable.</p>`
    return
  }
  const { content } = await res.json()
  _currentNoteMd = content
  $('note-view-body').innerHTML = marked.parse(preprocessMd(content))
  buildToc()

  if (section) {
    const heading = section.split(' > ').pop().toLowerCase()
    for (const el of $('note-view-body').querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      if (el.textContent.trim().toLowerCase().includes(heading)) {
        el.classList.add('note-highlight')
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
        break
      }
    }
  }
}

function buildToc() {
  const body     = $('note-view-body')
  const toc      = $('note-toc')
  const headings = [...body.querySelectorAll('h1,h2,h3,h4')]

  toc.innerHTML = ''

  if (headings.length < 3) { toc.classList.add('hidden'); return }
  toc.classList.remove('hidden')

  const label = document.createElement('div')
  label.className = 'toc-label'
  label.textContent = 'Sommaire'
  toc.appendChild(label)

  if (window._tocObserver) window._tocObserver.disconnect()

  headings.forEach((h, i) => {
    h.id = `h-${i}`
    const a = document.createElement('a')
    a.href = `#h-${i}`
    a.className = `toc-link toc-${h.tagName.toLowerCase()}`
    a.textContent = h.textContent
    a.addEventListener('click', e => {
      e.preventDefault()
      h.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    toc.appendChild(a)
  })

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const link = toc.querySelector(`a[href="#${entry.target.id}"]`)
      if (link) link.classList.toggle('toc-active', entry.isIntersecting)
    })
  }, { rootMargin: '-10% 0px -80% 0px', threshold: 0 })

  headings.forEach(h => observer.observe(h))
  window._tocObserver = observer
}

function toggleEdit() {
  if (_editMode) cancelEdit()
  else enterEdit()
}

function enterEdit() {
  if (!sessionStorage.getItem('edit_pwd')) {
    const pwd = prompt('Mot de passe pour éditer :')
    if (!pwd) return
    sessionStorage.setItem('edit_pwd', pwd)
  }
  _editMode = true
  $('note-editor').value = _currentNoteMd
  $('note-view-body').classList.add('hidden')
  $('note-toc').classList.add('hidden')
  $('note-edit-area').classList.remove('hidden')
  $('edit-btn').textContent = 'Aperçu'
  $('note-editor').focus()
}

function cancelEdit() {
  _editMode = false
  $('note-view-body').classList.remove('hidden')
  $('note-edit-area').classList.add('hidden')
  $('edit-btn').textContent = 'Modifier'
  buildToc()
}

async function saveNote() {
  const content = $('note-editor').value
  const btn = $('edit-btn')
  btn.textContent = 'Sauvegarde…'
  btn.disabled = true

  const res = await fetch('/api/note', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Edit-Password': sessionStorage.getItem('edit_pwd') || '',
    },
    body: JSON.stringify({ file: _currentNoteFile, content }),
  })

  btn.disabled = false
  if (res.status === 401) {
    sessionStorage.removeItem('edit_pwd')
    btn.textContent = 'Aperçu'
    alert('Mot de passe incorrect.')
    return
  }
  if (!res.ok) {
    btn.textContent = 'Aperçu'
    alert('Erreur lors de la sauvegarde.')
    return
  }

  _currentNoteMd = content
  $('note-view-body').innerHTML = marked.parse(preprocessMd(content))
  cancelEdit()
}

function closeNote() {
  if (history.state !== null) {
    history.back()
  } else {
    goHome()
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
