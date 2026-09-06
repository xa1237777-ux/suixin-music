const countryNames = {
  ALL: '全球', TW: '台灣', JP: '日本', KR: '韓國', US: '美國', GB: '英國', HK: '香港'
};
const languageNames = {
  all: '多國語言', 'zh-TW': '中文', nan: '台語', yue: '粵語', ja: '日文', ko: '韓文', en: '英文'
};
const genreNames = {
  all: '熱門好聽歌曲 精選', pop: '流行歌曲', ballad: '抒情歌曲', rock: '搖滾音樂', dance: '舞曲',
  hiphop: '嘻哈音樂', electronic: '電子音樂', rnb: 'R&B 音樂', jazz: '爵士音樂',
  classical: '古典音樂', oldies: '經典懷舊歌曲', copyrightfree: '無版權音樂'
};
const royaltyStyleQueries = {
  background: 'soft background music for shop',
  all: 'royalty free music',
  lofi: 'lofi chill background music',
  pop: 'upbeat pop background music',
  electronic: 'electronic background music',
  jazz: 'smooth jazz background music',
  piano: 'soft piano background music',
  guitar: 'acoustic guitar background music',
  cafe: 'coffee shop cafe background music',
  upbeat: 'upbeat happy background music',
  relaxing: 'relaxing calm background music'
};

export async function onRequestGet(context) {
  const apiKey = context.env.YOUTUBE_API_KEY;
  if (!apiKey) return response(500, { error: '尚未設定 YOUTUBE_API_KEY，請到 Cloudflare 的環境變數與祕密加入金鑰。' });

  const url = new URL(context.request.url);
  const p = Object.fromEntries(url.searchParams.entries());
  const country = countryNames[p.country] ? p.country : 'TW';
  const defaultLanguages = { TW: 'zh-TW', JP: 'ja', KR: 'ko', US: 'en', GB: 'en', HK: 'yue', ALL: 'all' };
  const requestedLanguage = languageNames[p.language] ? p.language : defaultLanguages[country];
  const language = requestedLanguage === 'all' && country !== 'ALL' ? defaultLanguages[country] : requestedLanguage;
  const genre = genreNames[p.genre] ? p.genre : 'all';
  const royaltyStyle = royaltyStyleQueries[p.royaltyStyle] ? p.royaltyStyle : 'background';
  const keyword = String(p.keyword || '').trim().slice(0, 80);
  const licenseMode = genre === 'copyrightfree';
  const mixed = country === 'ALL' && !keyword && !licenseMode;
  const query = keyword || buildCountryQuery(country, language, genre);
  const relevanceLanguage = ['zh-TW', 'nan', 'yue'].includes(language) ? 'zh' : language;
  const baseOptions = {
    key: apiKey,
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    videoEmbeddable: 'true',
    safeSearch: 'moderate',
    order: keyword ? 'relevance' : 'viewCount'
  };
  if (licenseMode) baseOptions.videoLicense = 'creativeCommon';

  try {
    const jobs = licenseMode ? [{
      q: keyword || royaltyStyleQueries[royaltyStyle], maxResults: '25', videoDuration: 'long'
    }] : mixed ? [
      { q: genre === 'all' ? '華語流行歌曲' : `華語 ${genreNames[genre]}`, regionCode: 'TW', relevanceLanguage: 'zh', maxResults: '10' },
      { q: genre === 'all' ? 'J-POP' : `J-POP ${genre}`, regionCode: 'JP', relevanceLanguage: 'ja', maxResults: '10' },
      { q: genre === 'all' ? 'K-POP' : `K-POP ${genre}`, regionCode: 'KR', relevanceLanguage: 'ko', maxResults: '10' },
      { q: genre === 'all' ? 'English pop music' : `English ${genre} music`, regionCode: 'US', relevanceLanguage: 'en', maxResults: '10' }
    ] : [{
      q: query,
      regionCode: country === 'ALL' ? undefined : country,
      relevanceLanguage: relevanceLanguage === 'all' ? undefined : relevanceLanguage,
      maxResults: '25'
    }];

    const results = await Promise.all(jobs.map(async job => {
      const options = { ...baseOptions, ...job };
      Object.keys(options).forEach(key => options[key] === undefined && delete options[key]);
      const youtube = await fetch(`https://www.googleapis.com/youtube/v3/search?${new URLSearchParams(options)}`);
      return { ok: youtube.ok, status: youtube.status, data: await youtube.json() };
    }));
    const successes = results.filter(result => result.ok);
    if (!successes.length) {
      const failed = results[0];
      const reason = failed.data?.error?.errors?.[0]?.reason;
      const message = reason === 'quotaExceeded'
        ? '今天的 YouTube 搜尋額度已用完，明天會自動恢復。'
        : 'YouTube 搜尋失敗，請檢查 API Key 設定。';
      return response(failed.status, { error: message });
    }
    const rawItems = successes.flatMap(result => result.data.items || []);
    let items = uniqueItems(rawItems);
    if (mixed && items.length < 8) {
      const fallbackOptions = { ...baseOptions, q: 'popular songs music', maxResults: '25', order: 'viewCount' };
      const fallback = await fetch(`https://www.googleapis.com/youtube/v3/search?${new URLSearchParams(fallbackOptions)}`);
      if (fallback.ok) {
        const fallbackData = await fallback.json();
        items = uniqueItems([...rawItems, ...(fallbackData.items || [])]);
      }
    }
    return response(200, { items });
  } catch (_) {
    return response(502, { error: '目前無法連線到 YouTube，請稍後再試。' });
  }
}

function uniqueItems(rawItems) {
  const seen = new Set();
  return rawItems.map(item => ({
    id: item.id.videoId,
    title: decode(item.snippet.title),
    channel: decode(item.snippet.channelTitle),
    thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || ''
  })).filter(item => item.id && !seen.has(item.id) && seen.add(item.id));
}

function buildCountryQuery(country, language, genre) {
  if (genre === 'copyrightfree') return 'royalty free background music';
  const genreTerm = genre === 'all' ? '' : genreNames[genre];
  const base = {
    TW: language === 'nan' ? '台語歌曲' : '華語流行歌曲', JP: 'J-POP', KR: 'K-POP',
    US: 'English pop music', GB: 'British pop music', HK: '廣東歌'
  }[country] || 'popular music';
  return `${base} ${genreTerm}`.trim();
}

function decode(value = '') {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}
