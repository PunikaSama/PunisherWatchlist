(function () {
    "use strict";

    if (window.__punisherWatchlistV101) return;
    window.__punisherWatchlistV101 = true;

    const supportedTypes = new Set(["Movie", "Series", "Episode"]);
    const state = {
        api: null,
        userId: "",
        ids: new Set(),
        loaded: false,
        loading: null,
        itemCache: new Map(),
        pendingCards: new Map(),
        cardTimer: 0,
        observer: null,
        scheduleTimer: 0,
        watchlistOpen: false,
        watchlistRequested: false
    };

    const eyeSvg = active => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c-5.4 0-9.3 4.2-10.5 6.3a1.4 1.4 0 0 0 0 1.4C2.7 14.8 6.6 19 12 19s9.3-4.2 10.5-6.3a1.4 1.4 0 0 0 0-1.4C21.3 9.2 17.4 5 12 5Zm0 11.3A4.3 4.3 0 1 1 12 7.7a4.3 4.3 0 0 1 0 8.6Zm0-2.2a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2Z"${active ? " fill=\"currentColor\"" : ""}/></svg>`;

    function apiClient() {
        return window.ApiClient || window.apiClient || null;
    }

    function visible(element) {
        return element instanceof HTMLElement && !element.hidden && element.getClientRects().length > 0;
    }

    async function apiJson(path, type = "GET") {
        const api = state.api || apiClient();
        if (!api) throw new Error("Jellyfin API is unavailable.");
        const response = await api.fetch({ url: api.getUrl(path), type });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.status === 204 ? null : response.json();
    }

    async function loadState(force = false) {
        const api = state.api || apiClient();
        const userId = api?.getCurrentUserId?.() || "";
        if (!api || !userId) return false;
        if (state.userId !== userId) {
            state.userId = userId;
            state.loaded = false;
            state.ids.clear();
            state.itemCache.clear();
        }
        if (state.loaded && !force) return true;
        if (!state.loading) {
            state.loading = apiJson("/PunisherWatchlist/items")
                .then(payload => {
                    const ids = payload?.ItemIds || payload?.itemIds || [];
                    state.ids = new Set(ids.map(id => String(id).toLowerCase()));
                    state.loaded = true;
                    return true;
                })
                .catch(() => false)
                .finally(() => { state.loading = null; });
        }
        return state.loading;
    }

    function cardId(card) {
        const direct = card?.dataset?.id || card?.dataset?.itemid || card?.getAttribute("data-itemid");
        if (direct) return direct;
        const link = card?.querySelector?.("a[href*='id='], a[href*='/details']") || (card?.matches?.("a") ? card : null);
        if (!link) return "";
        try {
            const href = new URL(link.href, window.location.href);
            const query = href.hash.includes("?") ? href.hash.split("?")[1] : href.search.slice(1);
            return new URLSearchParams(query).get("id") || "";
        } catch {
            return "";
        }
    }

    function currentDetailItemId() {
        const page = document.querySelector("#itemDetailPage:not(.hide)");
        const direct = page?.dataset?.id || page?.getAttribute("data-id");
        if (direct) return direct;
        const query = location.hash.includes("?") ? location.hash.split("?")[1] : location.search.slice(1);
        return new URLSearchParams(query).get("id") || "";
    }

    async function loadItems(ids) {
        const missing = [...new Set(ids.filter(Boolean))].filter(id => !state.itemCache.has(id.toLowerCase()));
        if (!missing.length) return;
        const api = state.api;
        let result;
        if (typeof api.getItems === "function") {
            result = await api.getItems(state.userId, {
                Ids: missing.join(","),
                Fields: "PrimaryImageAspectRatio,Overview,ProductionYear",
                EnableImages: true
            });
        } else {
            result = await apiJson(`/Items?UserId=${encodeURIComponent(state.userId)}&Ids=${encodeURIComponent(missing.join(","))}&Fields=PrimaryImageAspectRatio,Overview,ProductionYear`);
        }
        for (const item of result?.Items || result?.items || []) {
            state.itemCache.set(String(item.Id || item.id).toLowerCase(), item);
        }
    }

    function isSupported(item) {
        return supportedTypes.has(item?.Type || item?.type);
    }

    async function toggle(itemId, button) {
        if (!itemId || button?.dataset?.busy === "true") return;
        if (button) button.dataset.busy = "true";
        try {
            const result = await apiJson(`/PunisherWatchlist/items/${encodeURIComponent(itemId)}/toggle`, "POST");
            const active = result?.InWatchlist ?? result?.inWatchlist ?? false;
            const key = itemId.toLowerCase();
            if (active) state.ids.add(key); else state.ids.delete(key);
            syncButtons(itemId);
            document.dispatchEvent(new CustomEvent("punisherwatchlistchange", { detail: { itemId, active } }));
            if (state.watchlistOpen) await renderWatchlist();
        } catch {
            button?.classList.add("pw-watchlist-error");
            window.setTimeout(() => button?.classList.remove("pw-watchlist-error"), 900);
        } finally {
            if (button) delete button.dataset.busy;
        }
    }

    function updateButton(button, itemId) {
        const active = state.ids.has(itemId.toLowerCase());
        button.classList.toggle("pw-watchlist-active", active);
        button.setAttribute("aria-pressed", String(active));
        button.setAttribute("aria-label", active ? "Remove from Watchlist" : "Add to Watchlist");
        button.setAttribute("title", active ? "Remove from Watchlist" : "Add to Watchlist");
        const icon = button.querySelector(".pw-watchlist-icon");
        if (icon) icon.innerHTML = eyeSvg(active);
        const label = button.querySelector(".pw-watchlist-label");
        if (label) label.textContent = active ? "In Watchlist" : "Watchlist";
    }

    function syncButtons(itemId) {
        document.querySelectorAll(".pw-watchlist-button[data-pw-item-id]").forEach(button => {
            if (button.dataset.pwItemId?.toLowerCase() === itemId.toLowerCase()) updateButton(button, itemId);
        });
    }

    function makeButton(itemId, detail = false) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = detail
            ? "detailButton emby-button button-flat pw-watchlist-button pw-watchlist-detail-button"
            : "pw-watchlist-button pw-watchlist-card-button";
        button.dataset.pwItemId = itemId;
        button.innerHTML = detail
            ? `<span class="detailButton-content"><span class="pw-watchlist-icon"></span><span class="pw-watchlist-label"></span></span>`
            : `<span class="pw-watchlist-icon"></span>`;
        updateButton(button, itemId);
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            void toggle(itemId, button);
        });
        return button;
    }

    function favoriteButton(card) {
        const marker = card.querySelector([
            "[data-isfavorite]",
            "[data-is-favorite]",
            "button[title*='favorite' i]",
            "button[title*='favorit' i]",
            "button[aria-label*='favorite' i]",
            "button[aria-label*='favorit' i]",
            ".favorite",
            ".ratingbutton-icon-withrating"
        ].join(","));
        return marker?.matches?.("button") ? marker : marker?.closest?.("button");
    }

    function placeCardButton(card, itemId) {
        const button = makeButton(itemId);
        const favorite = favoriteButton(card);
        if (favorite?.parentElement) {
            button.classList.add("pw-watchlist-card-button-adjacent");
            favorite.insertAdjacentElement("afterend", button);
            return;
        }

        const actions = card.querySelector(".cardOverlayButtons, .cardOverlayButtonContainer, .cardIndicators");
        if (actions) {
            button.classList.add("pw-watchlist-card-button-adjacent");
            actions.appendChild(button);
            return;
        }

        const host = card.querySelector(".cardBox, .cardScalable") || card;
        host.classList.add("pw-watchlist-card-host");
        button.classList.add("pw-watchlist-card-button-fallback");
        host.appendChild(button);
    }

    async function ensureDetailButton() {
        const page = document.querySelector("#itemDetailPage:not(.hide)");
        const host = page?.querySelector(".mainDetailButtons");
        const itemId = currentDetailItemId();
        if (!host || !itemId) return;
        await loadItems([itemId]);
        const item = state.itemCache.get(itemId.toLowerCase());
        if (!isSupported(item)) return;
        const existing = host.querySelector(".pw-watchlist-detail-button");
        if (existing?.dataset?.pwItemId === itemId) {
            updateButton(existing, itemId);
            return;
        }
        existing?.remove();
        host.appendChild(makeButton(itemId, true));
    }

    function queueCard(card) {
        if (!(card instanceof HTMLElement) || card.closest(".pw-watchlist-page") || card.querySelector(":scope .pw-watchlist-card-button")) return;
        const itemId = cardId(card);
        if (!itemId) return;
        const key = itemId.toLowerCase();
        if (!state.pendingCards.has(key)) state.pendingCards.set(key, []);
        state.pendingCards.get(key).push(card);
        if (!state.cardTimer) state.cardTimer = window.setTimeout(flushCards, 70);
    }

    async function flushCards() {
        state.cardTimer = 0;
        const pending = new Map(state.pendingCards);
        state.pendingCards.clear();
        try {
            await loadItems([...pending.keys()]);
            for (const [key, cards] of pending) {
                if (!isSupported(state.itemCache.get(key))) continue;
                for (const card of cards) {
                    if (!card.isConnected || card.querySelector(":scope .pw-watchlist-card-button")) continue;
                    placeCardButton(card, cardId(card));
                }
            }
        } catch {
            // A later DOM update retries undecorated cards.
        }
    }

    function ensureCardButtons() {
        document.querySelectorAll(".homeSectionsContainer .card, .libraryPage .card, #itemDetailPage:not(.hide) .card").forEach(queueCard);
    }

    function homeContainer() {
        return [...document.querySelectorAll(".homeSectionsContainer, [data-testid='home-sections'], [class*='homeSectionsContainer']")].find(visible) || null;
    }

    function navigationHosts() {
        const hosts = new Set();
        document.querySelectorAll(".headerTabs").forEach(headerTabs => {
            const host = headerTabs.querySelector(".emby-tabs-slider") || headerTabs;
            if (visible(host)) hosts.add(host);
        });
        document.querySelectorAll(".MuiBottomNavigation-root, [class*='MuiBottomNavigation-root']").forEach(host => {
            if (visible(host)) hosts.add(host);
        });
        document.querySelectorAll("header nav, .skinHeader nav, .MuiDrawer-root nav, [class*='MuiDrawer-root'] nav").forEach(host => {
            if (visible(host) && host.querySelectorAll("a[href], button").length >= 2) hosts.add(host);
        });

        document.querySelectorAll(".MuiAppBar-root, [class*='MuiAppBar-root']").forEach(appBar => {
            if (!visible(appBar)) return;
            const links = [...appBar.querySelectorAll("a[href], button")].filter(link => {
                const text = link.textContent?.trim() || "";
                return text && !link.classList.contains("pft-brand-button") && !/^PunisherFin$/i.test(text);
            });
            if (!links.length) return;
            let host = links[0].parentElement;
            while (host && host !== appBar && host.querySelectorAll("a[href], button").length < 2) host = host.parentElement;
            if (host) hosts.add(host);
        });
        return [...hosts];
    }

    function makeNavigationLink(host) {
        const sample = host.querySelector("a[href]:not(.pft-brand-button), button:not(.pw-watchlist-tab)");
        const tab = document.createElement("a");
        tab.href = "#/home.html?pw-watchlist=1";
        tab.className = `${sample?.className || "emby-tab-button emby-button"} pw-watchlist-tab pw-watchlist-nav-link`;
        tab.setAttribute("role", sample?.getAttribute("role") || "tab");
        tab.innerHTML = `<span class="pw-watchlist-nav-icon">${eyeSvg(true)}</span><span class="pw-watchlist-nav-label">Watchlist</span>`;
        tab.addEventListener("click", event => {
            event.preventDefault();
            state.watchlistRequested = true;
            if (!location.hash.includes("pw-watchlist=1")) location.hash = "/home.html?pw-watchlist=1";
            schedule();
        });
        return tab;
    }

    function ensureWatchlistTab() {
        for (const host of navigationHosts()) {
            let tab = host.querySelector(":scope > .pw-watchlist-tab");
            if (!tab) {
                tab = makeNavigationLink(host);
                host.appendChild(tab);
            }
            tab.classList.toggle("emby-tab-button-active", state.watchlistOpen);
            tab.classList.toggle("pw-watchlist-nav-active", state.watchlistOpen);
            tab.setAttribute("aria-selected", String(state.watchlistOpen));
        }
    }

    async function openWatchlist() {
        const home = homeContainer();
        if (!home) {
            state.watchlistRequested = true;
            return;
        }
        const needsRender = !state.watchlistOpen || !home.parentElement?.querySelector(":scope > .pw-watchlist-page");
        state.watchlistOpen = true;
        state.watchlistRequested = true;
        home.classList.add("pw-watchlist-home-hidden");
        document.querySelectorAll(".pw-watchlist-tab").forEach(tab => {
            tab.parentElement?.querySelectorAll(".emby-tab-button-active, [aria-selected='true']").forEach(other => {
                if (other !== tab) {
                    other.classList.remove("emby-tab-button-active");
                    other.setAttribute("aria-selected", "false");
                }
            });
            if (tab) {
                tab.classList.add("emby-tab-button-active", "pw-watchlist-nav-active");
                tab.setAttribute("aria-selected", "true");
            }
        });
        if (needsRender) await renderWatchlist();
    }

    function closeWatchlist() {
        state.watchlistRequested = false;
        if (!state.watchlistOpen) return;
        state.watchlistOpen = false;
        document.querySelectorAll(".pw-watchlist-home-hidden").forEach(element => element.classList.remove("pw-watchlist-home-hidden"));
        document.querySelectorAll(".pw-watchlist-page").forEach(element => element.remove());
        document.querySelectorAll(".pw-watchlist-tab").forEach(tab => {
            tab.classList.remove("emby-tab-button-active");
            tab.classList.remove("pw-watchlist-nav-active");
            tab.setAttribute("aria-selected", "false");
        });
    }

    async function renderWatchlist() {
        const home = homeContainer();
        if (!home) return;
        let page = home.parentElement?.querySelector(":scope > .pw-watchlist-page");
        if (!page) {
            page = document.createElement("section");
            page.className = "pw-watchlist-page";
            home.insertAdjacentElement("afterend", page);
        }
        page.innerHTML = "<div class='pw-watchlist-heading'><h2>Watchlist</h2><span>Loading…</span></div>";
        await loadState(true);
        const ids = [...state.ids];
        if (!ids.length) {
            page.innerHTML = `<div class="pw-watchlist-heading"><h2>Watchlist</h2></div><div class="pw-watchlist-empty">Your Watchlist is empty. Use the eye button on a movie, series, or episode to add it.</div>`;
            return;
        }
        await loadItems(ids);
        const items = ids.map(id => state.itemCache.get(id)).filter(isSupported);
        page.innerHTML = `<div class="pw-watchlist-heading"><h2>Watchlist</h2><span>${items.length} ${items.length === 1 ? "title" : "titles"}</span></div><div class="pw-watchlist-grid"></div>`;
        const grid = page.querySelector(".pw-watchlist-grid");
        for (const item of items) grid.appendChild(watchlistCard(item));
    }

    function watchlistCard(item) {
        const id = String(item.Id || item.id);
        const title = item.Name || item.name || "Untitled";
        const card = document.createElement("article");
        card.className = "pw-watchlist-item";
        const link = document.createElement("a");
        link.href = `#/details?id=${encodeURIComponent(id)}`;
        link.className = "pw-watchlist-item-link";
        const image = document.createElement("div");
        image.className = "pw-watchlist-image";
        const imageUrl = state.api.getImageUrl?.(id, { type: "Primary", maxWidth: 480, quality: 90 });
        if (imageUrl) image.style.backgroundImage = `url("${String(imageUrl).replace(/"/g, "%22")}")`;
        const name = document.createElement("div");
        name.className = "pw-watchlist-name";
        name.textContent = title;
        const meta = document.createElement("div");
        meta.className = "pw-watchlist-meta";
        meta.textContent = [item.Type || item.type, item.ProductionYear || item.productionYear].filter(Boolean).join(" · ");
        link.append(image, name, meta);
        card.append(link, makeButton(id));
        return card;
    }

    async function synchronize() {
        state.api = apiClient();
        if (!state.api || !state.api.getCurrentUserId?.()) return;
        await loadState();
        ensureWatchlistTab();
        ensureCardButtons();
        await ensureDetailButton();
        if (state.watchlistRequested || location.hash.includes("pw-watchlist=1")) {
            await openWatchlist();
        } else if (state.watchlistOpen) {
            const home = homeContainer();
            if (home) home.classList.add("pw-watchlist-home-hidden"); else closeWatchlist();
        }
    }

    function schedule() {
        window.clearTimeout(state.scheduleTimer);
        state.scheduleTimer = window.setTimeout(() => { void synchronize(); }, 80);
    }

    function start() {
        if (!document.body || !apiClient()) {
            window.setTimeout(start, 150);
            return;
        }
        state.observer = new MutationObserver(schedule);
        state.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-id"] });
        document.addEventListener("click", event => {
            const tab = event.target instanceof Element ? event.target.closest(".emby-tab-button, [role='tab'], .MuiButtonBase-root") : null;
            if (tab && !tab.classList.contains("pw-watchlist-tab")) closeWatchlist();
        }, true);
        document.addEventListener("viewshow", () => {
            if (!location.hash.includes("pw-watchlist=1")) closeWatchlist();
            schedule();
        });
        window.addEventListener("hashchange", () => {
            state.watchlistRequested = location.hash.includes("pw-watchlist=1");
            if (!state.watchlistRequested) closeWatchlist();
            schedule();
        });
        window.addEventListener("popstate", schedule);
        schedule();
    }

    start();
})();
