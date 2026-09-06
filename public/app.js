const $ = (selector) => document.querySelector(selector);

const els = {
  form: $('#keywordForm'), keyword: $('#keyword'), country: $('#country'),
  language: $('#language'), genre: $('#genre'), royaltyStyleWrap: $('#royaltyStyleWrap'),
  royaltyStyle: $('#royaltyStyle'), auto: $('#autoPlayBtn'),
  status: $('#status'), now: $('#nowPlaying'), currentTitle: $('#currentTitle'),
  currentChannel: $('#currentChannel'), currentSource: $('#currentSource'), queue: $('#queue'), count: $('#queueCount'),
  prev: $('#prevBtn'), next: $('#nextBtn'), toggle: $('#toggleBtn'), reshuffle: $('#reshuffleBtn')
};

let tracks = [];
let currentIndex = -1;
let player = null;
let playerReady = false;
let pendingVideoId = null;

const labels = {
  countries: { ALL: '全部國家混合', TW: '台灣', JP: '日本', KR: '韓國', US: '美國', GB: '英國', HK: '香港' },
  languages: { all: '全部語言', 'zh-TW': '中文', nan: '台語', yue: '粵語', ja: '日文', ko: '韓文', en: '英文' },
  genres: { all: '全部', pop: '流行', ballad: '抒情', rock: '搖滾', dance: '舞曲', hiphop: '嘻哈', electronic: '電子', rnb: 'R&B', jazz: '爵士', classical: '古典', oldies: '懷舊', copyrightfree: '無版權音樂' }
};

window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player('player', {
    height: '360', width: '640', videoId: '',
    playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
    events: {
      onReady: () => {
        playerReady = true;
        if (pendingVideoId) player.loadVideoById(pendingVideoId);
      },
      onStateChange: (event) => {
        if (event.data === YT.PlayerState.ENDED) playNext();
        if (event.data === YT.PlayerState.PLAYING) els.toggle.textContent = 'Ⅱ';
        if (event.data === YT.PlayerState.PAUSED) els.toggle.textContent = '▶';
      },
      onError: () => playNext()
    }
  });
};

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle('error', isError);
}

function renderQueue() {
  els.count.textContent = `${tracks.length} 首`;
  if (!tracks.length) {
    els.queue.innerHTML = '<li class="empty">找不到歌曲，請換一組條件再試一次。</li>';
    return;
  }
  els.queue.innerHTML = tracks.map((track, index) => `
    <li class="queue-item ${index === currentIndex ? 'active' : ''}" data-index="${index}">
      <img class="queue-thumb" src="${track.thumbnail}" alt="" loading="lazy">
      <div class="queue-copy">
        <div class="queue-title">${escapeHtml(track.title)}</div>
        <div class="queue-channel">${escapeHtml(track.channel)}</div>
      </div>
      <button class="queue-play" type="button" aria-label="播放 ${escapeHtml(track.title)}">▶</button>
    </li>`).join('');
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}

function playAt(index) {
  if (!tracks.length) return;
  currentIndex = (index + tracks.length) % tracks.length;
  const track = tracks[currentIndex];
  els.now.hidden = false;
  els.currentTitle.textContent = track.title;
  els.currentChannel.textContent = track.channel;
  els.currentSource.href = `https://www.youtube.com/watch?v=${encodeURIComponent(track.id)}`;
  pendingVideoId = track.id;
  if (playerReady) player.loadVideoById(track.id);
  renderQueue();
  document.querySelector('.queue-item.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function playNext() { playAt(currentIndex + 1); }
function playPrev() { playAt(currentIndex - 1); }

async function searchMusic(keyword = '') {
  const country = els.country.value;
  const language = els.language.value;
  const genre = els.genre.value;
  const royaltyStyle = els.royaltyStyle.value;
  const params = new URLSearchParams({ country, language, genre, royaltyStyle, keyword });

  els.auto.disabled = true;
  setStatus(keyword ? `正在搜尋「${keyword}」…` : country === 'ALL' ? '正在混合中文、日文、韓文與英文熱門歌曲…' : '正在為你挑選歌曲…');
  try {
    const response = await fetch(`/api/youtube-search?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '搜尋失敗');
    tracks = shuffle(data.items || []);
    currentIndex = -1;
    renderQueue();
    if (!tracks.length) throw new Error('找不到符合條件的歌曲');
    const mixName = keyword || `${labels.countries[country]}・${labels.languages[language]}・${labels.genres[genre]}`;
    setStatus(genre === 'copyrightfree'
      ? '已篩選 Creative Commons 音樂；店內使用前請點「查看來源與授權」確認標示'
      : `已建立「${mixName}」隨機歌單`);
    playAt(0);
  } catch (error) {
    setStatus(error.message || '暫時無法搜尋，請稍後再試', true);
  } finally {
    els.auto.disabled = false;
  }
}

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const keyword = els.keyword.value.trim();
  if (!keyword) return setStatus('請先輸入歌名、歌手或關鍵字', true);
  searchMusic(keyword);
});
els.auto.addEventListener('click', () => searchMusic(''));
els.genre.addEventListener('change', () => {
  els.royaltyStyleWrap.hidden = els.genre.value !== 'copyrightfree';
  if (els.genre.value === 'copyrightfree') setStatus('選擇喜歡的無版權音樂風格，再按自動選歌播放');
});
els.country.addEventListener('change', () => {
  const defaultLanguages = { ALL: 'all', TW: 'zh-TW', JP: 'ja', KR: 'ko', US: 'en', GB: 'en', HK: 'yue' };
  els.language.value = defaultLanguages[els.country.value] || 'all';
});
els.next.addEventListener('click', playNext);
els.prev.addEventListener('click', playPrev);
els.toggle.addEventListener('click', () => {
  if (!playerReady) return;
  const state = player.getPlayerState();
  state === YT.PlayerState.PLAYING ? player.pauseVideo() : player.playVideo();
});
els.reshuffle.addEventListener('click', () => {
  if (!tracks.length) return setStatus('請先建立歌單', true);
  const current = currentIndex >= 0 ? tracks[currentIndex] : null;
  tracks = shuffle(tracks);
  currentIndex = current ? tracks.findIndex(track => track.id === current.id) : -1;
  renderQueue();
  setStatus('播放清單已重新隨機排列');
});
els.queue.addEventListener('click', (event) => {
  const item = event.target.closest('.queue-item');
  if (item) playAt(Number(item.dataset.index));
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
