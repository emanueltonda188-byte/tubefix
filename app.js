/* TubeFix — YouTube metadata fixer.
   Everything runs in the browser. No server. The app never sees your password:
   sign-in happens on Google's own screen and the token stays in this tab. */

(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const API = 'https://www.googleapis.com/youtube/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3';
  const SCOPE = 'https://www.googleapis.com/auth/youtube';

  const state = {
    clientId: localStorage.getItem('tubefix_client_id') || '',
    token: null,
    tokenClient: null,
    videos: [],
    selected: null, // { id, snippet, status }
    current: null,  // generated { title, titles, description, tags }
    thumbFile: null,
  };

  /* ---------------- small helpers ---------------- */

  function setStatus(el, msg, kind) {
    el.textContent = msg;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function markStep(n, done) {
    const li = document.querySelector('.step[data-step="' + n + '"]');
    if (!li) return;
    li.classList.toggle('done', !!done);
    li.classList.toggle('active', !done);
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {}, {
      Authorization: 'Bearer ' + state.token,
    });
    return fetch(API + path, opts).then(async (res) => {
      if (res.status === 401) {
        setStatus($('#connect-status'), 'Session expired — please sign in again.', 'err');
        state.token = null;
        $('#signin-btn').disabled = !state.clientId;
        throw new Error('unauthorized');
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data.error && data.error.message) || ('YouTube error ' + res.status);
        throw new Error(msg);
      }
      return data;
    });
  }

  /* ---------------- generation (ported from the TubeFix extension) ---------------- */

  const titleCase = (s) => s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));

  function buildTitles(topic) {
    const T = titleCase(topic.trim());
    return [
      T + ': Everything You Need to Know',
      'The Truth About ' + T,
      'How ' + T + ' Actually Works',
      'I Looked Into ' + T + " — Here's What I Found",
      T + ' Explained Simply',
      'What Nobody Tells You About ' + T,
    ];
  }

  function buildTags(topic) {
    const words = topic.toLowerCase().split(/\s+/).filter(Boolean);
    const tags = [];
    const push = (t) => { t = t.trim(); if (t && tags.indexOf(t) === -1) tags.push(t); };
    push(topic.toLowerCase());
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j <= Math.min(i + 2, words.length); j++) push(words.slice(i, j).join(' '));
    }
    ['explained', 'documentary', 'full video', 'breakdown', 'how to', '2026'].forEach(push);
    const out = [];
    let len = 0;
    for (const t of tags) {
      if (len + t.length + 1 > 490) break;
      out.push(t); len += t.length + 1;
    }
    return out;
  }

  function buildDescription(title, topic, tags) {
    const hashtags = tags.slice(0, 3).map((t) => '#' + t.replace(/\s+/g, '')).join(' ');
    return title + '\n\n' +
      'In this video, we break down ' + topic + ' — what it is, how it works, and why it matters.\n\n' +
      'If you found this useful, subscribe for more deep dives every week.\n\n' +
      '— Chapters, links and sources can go here —\n\n' + hashtags;
  }

  function updateTagsCount() {
    const v = $('#tags').value || '';
    $('#tags-count').textContent = String(v.length);
  }

  /* ---------------- step 1: connect ---------------- */

  function initTokenClient() {
    if (!window.google || !state.clientId) return;
    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: state.clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) {
          setStatus($('#connect-status'), 'Sign-in failed: ' + resp.error, 'err');
          return;
        }
        state.token = resp.access_token;
        $('#account-label').textContent = 'Signed in';
        $('#signin-btn').disabled = true;
        $('#signout-btn').classList.remove('hidden');
        $('#load-videos-btn').disabled = false;
        setStatus($('#connect-status'), 'Connected.', 'ok');
        markStep(1, true);
      },
    });
    $('#signin-btn').disabled = false;
  }

  $('#save-client-id').addEventListener('click', () => {
    const id = $('#client-id').value.trim();
    if (!id) { setStatus($('#connect-status'), 'Paste a client ID first.', 'err'); return; }
    state.clientId = id;
    localStorage.setItem('tubefix_client_id', id);
    initTokenClient();
    setStatus($('#connect-status'), 'Client ID saved. Now sign in.', 'ok');
  });

  $('#signin-btn').addEventListener('click', () => {
    if (!state.tokenClient) { initTokenClient(); }
    if (state.tokenClient) state.tokenClient.requestAccessToken({ prompt: 'consent' });
  });

  $('#signout-btn').addEventListener('click', () => {
    if (state.token && window.google) {
      google.accounts.oauth2.revoke(state.token, () => {});
    }
    state.token = null;
    state.selected = null;
    $('#account-label').textContent = 'Not signed in';
    $('#signin-btn').disabled = !state.clientId;
    $('#signout-btn').classList.add('hidden');
    $('#load-videos-btn').disabled = true;
    $('#generate-btn').disabled = true;
    $('#apply-btn').disabled = true;
    $('#thumb-btn').disabled = true;
    setStatus($('#connect-status'), 'Signed out.', '');
    markStep(1, false);
  });

  /* ---------------- step 2: pick a video ---------------- */

  $('#load-videos-btn').addEventListener('click', async () => {
    setStatus($('#videos-status'), 'Loading…', '');
    try {
      const data = await api('/videos?part=snippet,status&mine=true&maxResults=25');
      state.videos = data.items || [];
      const list = $('#video-list');
      list.innerHTML = '';
      if (!state.videos.length) {
        setStatus($('#videos-status'), 'No videos found on this account.', 'err');
        return;
      }
      state.videos.forEach((v) => {
        const b = document.createElement('button');
        b.className = 'video-item';
        b.type = 'button';
        const thumb = (v.snippet.thumbnails && v.snippet.thumbnails.default) ? v.snippet.thumbnails.default.url : '';
        b.innerHTML =
          (thumb ? '<img src="' + thumb + '" alt="" />' : '') +
          '<span><span class="v-title"></span><br /><span class="v-meta"></span></span>';
        b.querySelector('.v-title').textContent = v.snippet.title;
        b.querySelector('.v-meta').textContent =
          (v.status.privacyStatus || '') + ' · ' + new Date(v.snippet.publishedAt).toLocaleDateString();
        b.addEventListener('click', () => selectVideo(v, b));
        list.appendChild(b);
      });
      setStatus($('#videos-status'), state.videos.length + ' videos loaded. Click one to edit it.', 'ok');
    } catch (err) {
      setStatus($('#videos-status'), err.message, 'err');
    }
  });

  function selectVideo(v, btn) {
    document.querySelectorAll('.video-item').forEach((x) => x.classList.remove('selected'));
    btn.classList.add('selected');
    state.selected = v;
    $('#selected-video-label').textContent = 'Editing: ' + v.snippet.title;
    $('#topic').value = v.snippet.title;
    $('#title').value = v.snippet.title;
    $('#description').value = v.snippet.description || '';
    $('#tags').value = (v.snippet.tags || []).join(', ');
    updateTagsCount();
    $('#generate-btn').disabled = false;
    $('#apply-btn').disabled = false;
    $('#thumb-btn').disabled = !state.thumbFile;
    markStep(2, true);
    document.getElementById('card-3').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------------- step 3: metadata ---------------- */

  $('#generate-btn').addEventListener('click', () => {
    const topic = $('#topic').value.trim();
    if (!topic) { setStatus($('#apply-status'), 'Type a topic first.', 'err'); return; }
    const titles = buildTitles(topic);
    const tags = buildTags(topic);
    const description = buildDescription(titles[0], topic, tags);
    state.current = { title: titles[0], titles, description, tags, topic };

    const wrap = $('#title-options');
    wrap.innerHTML = '';
    titles.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'title-option' + (i === 0 ? ' active' : '');
      b.textContent = t;
      b.addEventListener('click', () => {
        state.current.title = t;
        state.current.description = buildDescription(t, topic, tags);
        $('#title').value = t;
        $('#description').value = state.current.description;
        wrap.querySelectorAll('.title-option').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      });
      wrap.appendChild(b);
    });
    $('#titles-block').classList.remove('hidden');
    $('#title').value = titles[0];
    $('#description').value = description;
    $('#tags').value = tags.join(', ');
    updateTagsCount();
    setStatus($('#apply-status'), 'Generated — edit anything, then Apply.', 'ok');
  });

  $('#tags').addEventListener('input', updateTagsCount);

  $('#apply-btn').addEventListener('click', async () => {
    if (!state.selected) return;
    const v = state.selected;
    // videos.update replaces the snippet, so carry over fields we are not editing.
    const snippet = {
      title: $('#title').value.trim(),
      description: $('#description').value,
      tags: $('#tags').value.split(',').map((t) => t.trim()).filter(Boolean),
      categoryId: v.snippet.categoryId,
    };
    if (v.snippet.defaultLanguage) snippet.defaultLanguage = v.snippet.defaultLanguage;
    if (v.snippet.defaultAudioLanguage) snippet.defaultAudioLanguage = v.snippet.defaultAudioLanguage;
    if (!snippet.title) { setStatus($('#apply-status'), 'Title cannot be empty.', 'err'); return; }

    setStatus($('#apply-status'), 'Applying…', '');
    try {
      await api('/videos?part=snippet', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: v.id, snippet: snippet }),
      });
      setStatus($('#apply-status'), 'Applied to YouTube.', 'ok');
      markStep(3, true);
      const links = $('#apply-links');
      links.innerHTML =
        '<a href="https://www.youtube.com/watch?v=' + v.id + '" target="_blank" rel="noopener">Watch video</a>' +
        ' · <a href="https://studio.youtube.com/video/' + v.id + '/edit" target="_blank" rel="noopener">Open in Studio</a>';
      links.classList.remove('hidden');
      // keep local copy in sync
      v.snippet.title = snippet.title;
      v.snippet.description = snippet.description;
      v.snippet.tags = snippet.tags;
    } catch (err) {
      setStatus($('#apply-status'), err.message, 'err');
    }
  });

  /* ---------------- step 4: thumbnail ---------------- */

  $('#thumb-file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    state.thumbFile = f || null;
    if (!f) {
      $('#thumb-preview-wrap').classList.add('hidden');
      $('#thumb-btn').disabled = true;
      return;
    }
    const url = URL.createObjectURL(f);
    const img = $('#thumb-preview');
    img.src = url;
    img.onload = () => {
      $('#thumb-info').textContent =
        f.name + ' · ' + img.naturalWidth + '×' + img.naturalHeight +
        (img.naturalWidth === 1280 && img.naturalHeight === 720
          ? ' · recommended size'
          : ' · recommended: 1280 × 720');
    };
    $('#thumb-preview-wrap').classList.remove('hidden');
    $('#thumb-btn').disabled = !state.selected || !state.token;
  });

  $('#thumb-btn').addEventListener('click', async () => {
    if (!state.selected || !state.thumbFile) return;
    setStatus($('#thumb-status'), 'Uploading thumbnail…', '');
    try {
      const res = await fetch(UPLOAD + '/thumbnails/set?videoId=' + state.selected.id, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + state.token,
          'Content-Type': state.thumbFile.type || 'image/jpeg',
        },
        body: state.thumbFile,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setStatus($('#thumb-status'), 'Session expired — please sign in again.', 'err');
        return;
      }
      if (!res.ok) throw new Error((data.error && data.error.message) || ('YouTube error ' + res.status));
      setStatus($('#thumb-status'), 'Thumbnail set.', 'ok');
      markStep(4, true);
    } catch (err) {
      setStatus($('#thumb-status'), err.message, 'err');
    }
  });

  /* ---------------- boot ---------------- */

  if (window.location.protocol === 'file:') {
    $('#file-warning').classList.remove('hidden');
  }
  if (state.clientId) {
    $('#client-id').value = state.clientId;
    // GIS loads async; retry briefly until it is ready.
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (window.google) { clearInterval(timer); initTokenClient(); }
      else if (tries > 20) { clearInterval(timer); }
    }, 250);
  }
})();
