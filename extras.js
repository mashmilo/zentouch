// Zentouch add-ons: People/follow, Messages, Alerts, Profile, Moderation.
// Loaded after the main script in index.html, so it shares db, me, $, esc, ago, loadFeed.
(() => {
document.head.append(Object.assign(document.createElement("style"), { textContent: `
#nav{display:flex;gap:2px;overflow-x:auto}
#nav button{background:none;border:0;color:#fff;opacity:.7;padding:8px 10px;border-radius:8px;font-weight:500;white-space:nowrap}
#nav button.on{opacity:1;background:#ffffff26}
#badge{background:var(--green);color:#10201a;border-radius:99px;padding:0 6px;font-size:12px;font-weight:700;margin-left:4px}
.urow{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.urow div{flex:1;display:flex;flex-direction:column;line-height:1.25;min-width:0}
.urow small{color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
img.av{object-fit:cover}
.chk{display:flex;gap:8px;align-items:center;margin-bottom:10px;color:var(--mute)}
.chk input{width:auto}
#thread{height:50vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:10px 0}
.m{max-width:78%;padding:8px 12px;border-radius:14px;background:var(--bg);overflow-wrap:anywhere}
.m.mine{align-self:flex-end;background:var(--green);color:#10201a}
.unread{border-left:4px solid var(--green)}
#panel .card{margin-bottom:10px}
`}));

const main = $("main"), panel = document.createElement("div");
panel.id = "panel"; panel.className = "hide"; main.append(panel);
const views = {}; let chat = null; window.followIds = []; window.onlyFollowing = false;
const av = u => u.avatar_url ? `<img class="av" src="${esc(u.avatar_url)}" alt="">`
  : `<span class="av">${esc((u.name || "U")[0].toUpperCase())}</span>`;

/* ---------- navigation ---------- */
function active(t) {
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.dataset.t === t));
  const home = t === "home";
  $("#postForm").classList.toggle("hide", !home); $("#feed").classList.toggle("hide", !home);
  panel.classList.toggle("hide", home);
}
async function show(t) {
  chat = null; active(t);
  if (t === "home") { await loadFollows(); loadFeed(); } else await views[t]();
}
$("#nav").addEventListener("click", e => { const b = e.target.closest("button"); if (b) show(b.dataset.t); });

async function loadFollows() {
  const { data } = await db.from("follows").select("following_id").eq("follower_id", me.id);
  window.followIds = (data || []).map(r => r.following_id);
}
async function badge() {
  if (!me) return;
  const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("read", false);
  $("#badge").textContent = count || ""; $("#badge").classList.toggle("hide", !count);
}

/* ---------- people + follow ---------- */
views.people = async () => {
  await loadFollows();
  const { data } = await db.from("profiles").select("id,name,bio,avatar_url").neq("id", me.id).order("name").limit(100);
  panel.innerHTML = `<label class="chk"><input type="checkbox" id="onlyF" ${window.onlyFollowing ? "checked" : ""}> Home shows only people I follow</label>`
    + (data.length ? data.map(u => `<div class="card urow" data-id="${u.id}" data-name="${esc(u.name)}">${av(u)}
      <div><b>${esc(u.name)}</b><small>${esc(u.bio || "")}</small></div>
      <button class="ghost" data-a="follow">${followIds.includes(u.id) ? "Unfollow" : "Follow"}</button>
      <button class="ghost" data-a="dm">Message</button></div>`).join("")
      : '<p class="empty">No other people have joined yet.</p>');
};

/* ---------- messages ---------- */
views.msgs = async () => {
  const { data } = await db.from("messages")
    .select("body,sender_id,receiver_id,sender:profiles!sender_id(name),receiver:profiles!receiver_id(name)")
    .order("created_at", { ascending: false }).limit(200);
  const seen = {};
  (data || []).forEach(m => {
    const o = m.sender_id === me.id ? { id: m.receiver_id, name: m.receiver.name } : { id: m.sender_id, name: m.sender.name };
    if (!seen[o.id]) seen[o.id] = { ...o, last: m.body };
  });
  const l = Object.values(seen);
  panel.innerHTML = l.length ? l.map(c => `<div class="card urow" data-id="${c.id}" data-name="${esc(c.name)}">
    <span class="av">${esc(c.name[0].toUpperCase())}</span><div><b>${esc(c.name)}</b><small>${esc(c.last)}</small></div>
    <button class="ghost" data-a="dm">Open</button></div>`).join("")
    : '<p class="empty">No messages yet. Open People and tap Message.</p>';
};
async function openChat(id, name) {
  chat = id; active("msgs");
  panel.innerHTML = `<div class="card"><div class="row"><button class="ghost" data-a="back">Back</button><b>${esc(name)}</b></div>
    <div id="thread"></div><form id="msgForm" class="row"><input id="msgIn" maxlength="1000" placeholder="Write a message" required><button class="btn">Send</button></form></div>`;
  await loadThread();
}
async function loadThread() {
  const { data } = await db.from("messages").select("body,sender_id")
    .or(`and(sender_id.eq.${me.id},receiver_id.eq.${chat}),and(sender_id.eq.${chat},receiver_id.eq.${me.id})`)
    .order("created_at").limit(200);
  const t = $("#thread"); if (!t) return;
  t.innerHTML = (data || []).map(m => `<div class="m ${m.sender_id === me.id ? "mine" : ""}">${esc(m.body)}</div>`).join("");
  t.scrollTop = t.scrollHeight;
}

/* ---------- alerts ---------- */
views.alerts = async () => {
  const { data } = await db.from("notifications").select("type,read,created_at,actor:profiles!actor_id(name)")
    .order("created_at", { ascending: false }).limit(40);
  const T = { like: "liked your post", comment: "commented on your post", follow: "started following you", message: "sent you a message" };
  panel.innerHTML = data.length ? data.map(n => `<div class="card ${n.read ? "" : "unread"}"><b>${esc(n.actor?.name || "Someone")}</b> ${T[n.type] || ""} <small>${ago(n.created_at)}</small></div>`).join("")
    : '<p class="empty">No alerts yet.</p>';
  await db.from("notifications").update({ read: true }).eq("read", false); badge();
};

/* ---------- profile + moderation ---------- */
views.me = async () => {
  const { data: p } = await db.from("profiles").select("name,bio,avatar_url,is_admin").eq("id", me.id).single();
  panel.innerHTML = `<form class="card" id="profForm" style="display:grid;gap:10px;justify-items:start">${av(p)}
    <input id="pn" value="${esc(p.name)}" maxlength="40" required aria-label="Name">
    <textarea id="pb" maxlength="160" placeholder="Short bio" aria-label="Bio">${esc(p.bio || "")}</textarea>
    <label class="pick">Change profile photo<input id="pf" type="file" accept="image/*" class="hide"></label>
    <button class="btn">Save profile</button><small id="ps"></small></form><div id="rep"></div>`;
  if (p.is_admin) loadReports();
};
async function loadReports() {
  const { data } = await db.from("reports").select("id,post_id,reason,posts(body,profiles(name))").order("created_at", { ascending: false }).limit(30);
  $("#rep").innerHTML = "<h3>Reported posts</h3>" + (data.length ? data.map(r => `<div class="card" data-rid="${r.id}" data-pid="${r.post_id}">
    <b>${esc(r.posts?.profiles?.name || "")}</b>: ${esc(r.posts?.body || "(photo post)")}<br><small>Reason: ${esc(r.reason || "none")}</small>
    <div class="row"><button class="ghost" data-a="rdel">Delete post</button><button class="ghost" data-a="rok">Dismiss</button></div></div>`).join("")
    : '<p class="empty">No reports.</p>');
}

/* ---------- events ---------- */
panel.addEventListener("click", async e => {
  const b = e.target.closest("[data-a]"); if (!b || b.tagName === "FORM") return;
  const row = b.closest("[data-id]"), id = row?.dataset.id, a = b.dataset.a;
  if (a === "follow") {
    if (b.textContent === "Unfollow") await db.from("follows").delete().match({ follower_id: me.id, following_id: id });
    else await db.from("follows").insert({ following_id: id });
    views.people();
  }
  if (a === "dm") openChat(id, row.dataset.name);
  if (a === "back") show("msgs");
  const rr = b.closest("[data-rid]");
  if (a === "rdel") { await db.from("posts").delete().eq("id", +rr.dataset.pid); loadReports(); }
  if (a === "rok") { await db.from("reports").delete().eq("id", +rr.dataset.rid); loadReports(); }
});
panel.addEventListener("change", e => { if (e.target.id === "onlyF") window.onlyFollowing = e.target.checked; });
panel.addEventListener("submit", async e => {
  e.preventDefault();
  if (e.target.id === "msgForm") {
    const v = $("#msgIn").value.trim(); if (!v) return; $("#msgIn").value = "";
    await db.from("messages").insert({ receiver_id: chat, body: v }); loadThread();
  }
  if (e.target.id === "profForm") {
    const upd = { name: $("#pn").value.trim(), bio: $("#pb").value.trim() || null }, f = $("#pf").files[0];
    if (f) {
      if (f.size > 5e6) { $("#ps").textContent = "Photo must be under 5 MB."; return; }
      const path = `${me.id}/avatar-${Date.now()}`;
      const up = await db.storage.from("images").upload(path, f);
      if (up.error) { $("#ps").textContent = up.error.message; return; }
      upd.avatar_url = db.storage.from("images").getPublicUrl(path).data.publicUrl;
    }
    const r = await db.from("profiles").update(upd).eq("id", me.id);
    $("#ps").textContent = r.error ? r.error.message : "Saved.";
    if (!r.error) { $("#meName").textContent = upd.name; }
  }
});

db.channel("zt")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, p => {
    if (chat && p.new.sender_id === chat && $("#thread")) loadThread();
  })
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, badge)
  .subscribe();
db.auth.onAuthStateChange((_e, s) => { if (s) setTimeout(() => { loadFollows(); badge(); }, 100); });
})();
