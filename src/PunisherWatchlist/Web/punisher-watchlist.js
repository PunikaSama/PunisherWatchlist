(function () {
    "use strict";

    if (window.__punisherWatchlistV111) return;
    window.__punisherWatchlistV111 = true;

    const isWatchlistRoute = () => location.search.includes("pw-watchlist=1") || location.hash.includes("pw-watchlist=1");
    if (isWatchlistRoute()) document.documentElement.classList.add("pw-watchlist-route-active");

    const supportedTypes = new Set(["Movie", "Series", "Season", "Episode"]);
    const state = {
        api: null,
        userId: "",
        ids: new Set(),
        loaded: false,
        loading: null,
        itemCache: new Map(),
        aliases: new Map(),
        observer: null,
        scheduleTimer: 0,
        watchlistOpen: false,
        watchlistRequested: isWatchlistRoute(),
        patchedApi: null,
        originalGetItems: null,
        nativeNavigation: false
    };

    const eyeSvg = active => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c-5.4 0-9.3 4.2-10.5 6.3a1.4 1.4 0 0 0 0 1.4C2.7 14.8 6.6 19 12 19s9.3-4.2 10.5-6.3a1.4 1.4 0 0 0 0-1.4C21.3 9.2 17.4 5 12 5Zm0 11.3A4.3 4.3 0 1 1 12 7.7a4.3 4.3 0 0 1 0 8.6Zm0-2.2a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2Z"${active ? " fill=\"currentColor\"" : ""}/></svg>`;

    function apiClient() {
        return window.ApiClient || window.apiClient || null;
    }

    function visible(element) {
        return element instanceof HTMLElement && !element.hidden && element.getClientRects().length > 0;
    }

    async function apiJson(path, type = "GET", parameters) {
        const api = state.api || apiClient();
        if (!api) throw new Error("Jellyfin API is unavailable.");
        const response = await api.fetch({ url: api.getUrl(path, parameters), type });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.status === 204 ? null : response.json();
    }

    function normalizeId(value) {
        return String(value || "").replace(/-/g, "").toLowerCase();
    }

    function isFavoriteItemsRequest(options) {
        if (options?.IsFavorite === true || options?.isFavorite === true) return true;
        const value = options?.Filters ?? options?.filters ?? "";
        const filters = Array.isArray(value) ? value : String(value).split(",");
        return filters.includes("IsFavorite");
    }

    function nativeWatchlistOptions(options, ids) {
        const result = { ...options, Ids: ids.join(",") };
        delete result.Filters;
        delete result.filters;
        delete result.IsFavorite;
        delete result.isFavorite;
        return result;
    }

    function localStorageKey() {
        return `punisher-watchlist:${location.origin}:${state.userId || "anonymous"}`;
    }

    function readLocalIds() {
        try {
            const value = JSON.parse(localStorage.getItem(localStorageKey()) || "[]");
            return Array.isArray(value) ? value.map(normalizeId).filter(Boolean) : [];
        } catch {
            return [];
        }
    }

    function writeLocalIds() {
        try {
            localStorage.setItem(localStorageKey(), JSON.stringify([...state.ids]));
        } catch {
            // Server-side storage remains the primary source when browser storage is unavailable.
        }
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
            state.aliases.clear();
        }
        if (state.loaded && !force) return true;
        if (!state.loading) {
            state.loading = apiJson("/PunisherWatchlist/items")
                .then(payload => {
                    const ids = payload?.ItemIds || payload?.itemIds || [];
                    state.ids = new Set([...ids.map(normalizeId), ...readLocalIds()].filter(Boolean));
                    state.loaded = true;
                    writeLocalIds();
                    syncAllButtons();
                    return true;
                })
                .catch(error => {
                    console.error("PunisherWatchlist could not load server storage; using the browser cache.", error);
                    state.ids = new Set(readLocalIds());
                    state.loaded = true;
                    syncAllButtons();
                    return true;
                })
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

    function isLibraryFolderCard(card) {
        const type = card?.dataset?.type || card?.dataset?.itemType || card?.getAttribute?.("data-type") || "";
        if (/^(CollectionFolder|UserView|AggregateFolder|BoxSet|Playlist)$/i.test(type)) return true;
        return [...(card?.querySelectorAll?.("a[href]") || [])].some(link => {
            const href = link.getAttribute("href") || "";
            return /#\/(movies|tv|music|livetv|home)(?:\?|$)/i.test(href)
                && /(?:topParentId|collectionType|parentId)=/i.test(href);
        });
    }

    function currentDetailItemId() {
        const page = document.querySelector("#itemDetailPage:not(.hide)");
        const direct = page?.dataset?.id || page?.getAttribute("data-id");
        if (direct) return direct;
        const query = location.hash.includes("?") ? location.hash.split("?")[1] : location.search.slice(1);
        return new URLSearchParams(query).get("id") || "";
    }

    async function loadItems(ids) {
        const missing = [...new Set(ids.map(normalizeId).filter(Boolean))].filter(id => !state.itemCache.has(id));
        if (!missing.length) return;
        const result = await apiJson("/Items", "GET", {
            UserId: state.userId,
            Ids: missing.join(","),
            Fields: "PrimaryImageAspectRatio,Overview,ProductionYear",
            EnableImages: true,
            EnableUserData: true
        });
        for (const item of result?.Items || result?.items || []) {
            state.itemCache.set(normalizeId(item.Id || item.id), item);
        }
    }

    function isSupported(item) {
        return supportedTypes.has(item?.Type || item?.type);
    }

    function parentSeriesId(item) {
        const type = item?.Type || item?.type;
        if (type !== "Episode" && type !== "Season") return "";
        return normalizeId(item?.SeriesId || item?.seriesId);
    }

    async function canonicalClientId(itemId) {
        const sourceKey = normalizeId(itemId);
        const known = state.aliases.get(sourceKey);
        if (known) return known;
        try {
            await loadItems([itemId]);
            const seriesId = parentSeriesId(state.itemCache.get(sourceKey));
            if (seriesId) {
                state.aliases.set(sourceKey, seriesId);
                return seriesId;
            }
        } catch (error) {
            console.warn("PunisherWatchlist could not resolve the parent series in the client.", error);
        }
        return sourceKey;
    }

    async function normalizeStoredIds() {
        const ids = [...state.ids];
        try {
            await loadItems(ids);
        } catch {
            return;
        }

        let changed = false;
        for (const id of ids) {
            const seriesId = parentSeriesId(state.itemCache.get(id));
            if (!seriesId || seriesId === id) continue;
            state.aliases.set(id, seriesId);
            state.ids.delete(id);
            state.ids.add(seriesId);
            changed = true;
        }
        if (changed) writeLocalIds();
    }

    function watchlistUrl() {
        const url = new URL(location.href);
        url.searchParams.set("pw-watchlist", "1");
        return `${url.pathname}${url.search}${url.hash.replace(/([?&])pw-watchlist=1(&|$)/, (_match, lead, tail) => tail ? lead : "")}`;
    }

    function removeWatchlistUrlMarker() {
        if (!isWatchlistRoute()) return;
        const url = new URL(location.href);
        url.searchParams.delete("pw-watchlist");
        const cleanHash = url.hash
            .replace(/([?&])pw-watchlist=1(&|$)/, (_match, lead, tail) => tail ? lead : "")
            .replace(/[?&]$/, "");
        history.replaceState(history.state, "", `${url.pathname}${url.search}${cleanHash}`);
    }

    function isHomeRoute() {
        return /^#\/(?:home|home\.html)(?:[?]|$)/i.test(location.hash);
    }

    function isFavoriteListRoute() {
        return /^#\/list(?:[?]|$)/i.test(location.hash) && /[?&]isfavorite=true(?:&|$)/i.test(location.hash);
    }

    async function toggle(itemId, button) {
        if (!itemId || button?.dataset?.busy === "true") return;
        if (button) button.dataset.busy = "true";
        const sourceKey = normalizeId(itemId);
        const effectiveKey = await canonicalClientId(itemId);
        const desired = !state.ids.has(effectiveKey);
        if (desired) state.ids.add(effectiveKey); else state.ids.delete(effectiveKey);
        writeLocalIds();
        syncButtons(itemId);
        try {
            const result = await apiJson(`/PunisherWatchlist/items/${encodeURIComponent(effectiveKey)}`, desired ? "PUT" : "DELETE");
            const active = result?.InWatchlist ?? result?.inWatchlist ?? desired;
            const canonicalKey = normalizeId(result?.ItemId ?? result?.itemId ?? effectiveKey);
            state.aliases.set(sourceKey, canonicalKey);
            state.ids.delete(sourceKey);
            state.ids.delete(effectiveKey);
            if (active) state.ids.add(canonicalKey); else state.ids.delete(canonicalKey);
            writeLocalIds();
            syncButtons(itemId);
            document.dispatchEvent(new CustomEvent("punisherwatchlistchange", { detail: { itemId, active } }));
            if (state.watchlistOpen) refreshNativeWatchlist();
        } catch (error) {
            console.error("PunisherWatchlist could not update the item.", error);
            button?.classList.add("pw-watchlist-error");
            window.setTimeout(() => button?.classList.remove("pw-watchlist-error"), 900);
        } finally {
            if (button) delete button.dataset.busy;
        }
    }

    function updateButton(button, itemId) {
        const sourceKey = normalizeId(itemId);
        const active = state.ids.has(state.aliases.get(sourceKey) || sourceKey);
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
            if (normalizeId(button.dataset.pwItemId) === normalizeId(itemId)) updateButton(button, itemId);
        });
    }

    function syncAllButtons() {
        document.querySelectorAll(".pw-watchlist-button[data-pw-item-id]").forEach(button => {
            if (button.dataset.pwItemId) updateButton(button, button.dataset.pwItemId);
        });
    }

    function makeButton(itemId, detail = false) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = detail
            ? "detailButton emby-button button-flat pw-watchlist-button pw-watchlist-detail-button"
            : "paper-icon-button-light cardOverlayButton cardOverlayButton-hover itemAction pw-watchlist-button pw-watchlist-card-button";
        button.dataset.pwItemId = itemId;
        button.innerHTML = detail
            ? `<span class="detailButton-content"><span class="pw-watchlist-icon" aria-hidden="true"></span></span>`
            : `<span class="cardOverlayButtonIcon cardOverlayButtonIcon-hover pw-watchlist-icon" aria-hidden="true"></span>`;
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
            favorite.classList.forEach(className => {
                if (!/favorite|rating|played/i.test(className)) button.classList.add(className);
            });
            button.classList.add("pw-watchlist-card-button-adjacent");
            favorite.insertAdjacentElement("afterend", button);
            return;
        }

        const actions = card.querySelector(".cardOverlayButton-br, .cardOverlayButtons, .cardOverlayButtonContainer");
        if (actions) {
            button.classList.add("pw-watchlist-card-button-adjacent");
            const moreButton = actions.lastElementChild;
            if (moreButton) actions.insertBefore(button, moreButton);
            else actions.appendChild(button);
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
        const item = state.itemCache.get(normalizeId(itemId));
        if (!isSupported(item)) return;
        const seriesId = parentSeriesId(item);
        if (seriesId) state.aliases.set(normalizeId(itemId), seriesId);
        const existing = host.querySelector(".pw-watchlist-detail-button");
        if (normalizeId(existing?.dataset?.pwItemId) === normalizeId(itemId)) {
            updateButton(existing, itemId);
            return;
        }
        existing?.remove();
        const button = makeButton(itemId, true);
        const more = host.querySelector(".btnMoreCommands, [data-action='more'], button[title*='more' i], button[title*='mehr' i]") || host.lastElementChild;
        if (more) host.insertBefore(button, more); else host.appendChild(button);
    }

    function queueCard(card) {
        if (!(card instanceof HTMLElement) || isLibraryFolderCard(card) || card.querySelector(":scope .pw-watchlist-card-button")) return;
        const itemId = cardId(card);
        if (!itemId) return;
        placeCardButton(card, itemId);
    }

    function ensureCardButtons() {
        document.querySelectorAll(".card").forEach(queueCard);
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
        document.querySelectorAll("header nav, .skinHeader nav").forEach(host => {
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
        const candidates = [...hosts];
        return candidates.filter(host => !candidates.some(other => other !== host && host.contains(other)));
    }

    function makeNavigationLink(host) {
        const sample = host.querySelector("a[href]:not(.pft-brand-button), button:not(.pw-watchlist-tab)");
        const tab = document.createElement("a");
        tab.href = "?pw-watchlist=1";
        tab.className = `${sample?.className || "emby-tab-button emby-button"} pw-watchlist-tab pw-watchlist-nav-link`;
        tab.setAttribute("role", sample?.getAttribute("role") || "tab");
        tab.innerHTML = `<span class="pw-watchlist-nav-icon">${eyeSvg(true)}</span><span class="pw-watchlist-nav-label">Watchlist</span>`;
        return tab;
    }

    function normalizedLabel(element) {
        return (element?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    function favoriteNavigationItem(host) {
        return [...host.querySelectorAll("a[href], button")].find(item => /^(favoriten|favorites)$/.test(normalizedLabel(item))) || null;
    }

    function placeAfterFavorites(host, tab) {
        const favorite = favoriteNavigationItem(host);
        if (favorite) {
            if (favorite.nextElementSibling !== tab) favorite.insertAdjacentElement("afterend", tab);
        } else if (tab.parentElement !== host) {
            host.appendChild(tab);
        }
    }

    function activateWatchlistRoute(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        state.watchlistRequested = true;
        document.documentElement.classList.add("pw-watchlist-route-active");
        if (!isWatchlistRoute()) history.pushState({ ...(history.state || {}), punisherWatchlist: true }, "", watchlistUrl());
        document.querySelector(".MuiBackdrop-root, [class*='MuiBackdrop-root']")?.click?.();
        void openWatchlist();
    }

    function ensureWatchlistTab() {
        for (const host of navigationHosts()) {
            let tab = host.querySelector(".pw-watchlist-tab:not(.pw-watchlist-drawer-link)");
            if (!tab) {
                tab = makeNavigationLink(host);
                tab.addEventListener("click", activateWatchlistRoute);
            }
            placeAfterFavorites(host, tab);
            tab.classList.toggle("emby-tab-button-active", state.watchlistOpen);
            tab.classList.toggle("pw-watchlist-nav-active", state.watchlistOpen);
            tab.setAttribute("aria-selected", String(state.watchlistOpen));
        }
        ensureDrawerLink();
    }

    function ensureDrawerLink() {
        document.querySelectorAll(".MuiDrawer-root, [class*='MuiDrawer-root'], .mainDrawer").forEach(drawer => {
            if (!visible(drawer)) return;
            const favorite = favoriteNavigationItem(drawer);
            if (!favorite?.parentElement) return;
            let link = drawer.querySelector(".pw-watchlist-drawer-link");
            if (!link) {
                link = favorite.cloneNode(true);
                link.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
                link.classList.add("pw-watchlist-tab", "pw-watchlist-drawer-link");
                link.classList.remove("Mui-selected", "navMenuOption-selected", "selected");
                link.href = "?pw-watchlist=1";
                link.removeAttribute("aria-current");
                const icon = link.querySelector(".MuiListItemIcon-root, [class*='MuiListItemIcon-root'], .listItemIcon");
                if (icon) icon.innerHTML = `<span class="pw-watchlist-nav-icon">${eyeSvg(true)}</span>`;
                const label = link.querySelector(".MuiListItemText-primary, [class*='MuiListItemText-primary'], .listItemBodyText");
                if (label) label.textContent = "Watchlist";
                link.addEventListener("click", event => {
                    event.preventDefault();
                    activateWatchlistRoute();
                });
            }
            if (favorite.nextElementSibling !== link) favorite.insertAdjacentElement("afterend", link);
            link.classList.toggle("pw-watchlist-nav-active", state.watchlistOpen);
            link.setAttribute("aria-selected", String(state.watchlistOpen));
        });
    }

    function installNativeItemsProvider() {
        const api = state.api || apiClient();
        if (!api?.getItems || state.patchedApi === api) return;
        const original = api.getItems.bind(api);
        state.patchedApi = api;
        state.originalGetItems = original;
        api.getItems = (userId, options = {}) => {
            if (!state.watchlistOpen || !isFavoriteItemsRequest(options)) return original(userId, options);
            const ids = [...state.ids];
            if (!ids.length) return Promise.resolve({ Items: [], TotalRecordCount: 0, StartIndex: 0 });
            return original(userId, nativeWatchlistOptions(options, ids));
        };
    }

    function syncWatchlistNavigation() {
        document.querySelectorAll(".pw-watchlist-tab").forEach(tab => {
            tab.parentElement?.querySelectorAll(".emby-tab-button-active, [aria-selected='true']").forEach(other => {
                if (other !== tab) {
                    other.classList.remove("emby-tab-button-active");
                    other.setAttribute("aria-selected", "false");
                }
            });
            tab.classList.add("emby-tab-button-active", "pw-watchlist-nav-active");
            tab.setAttribute("aria-selected", "true");
        });
    }

    function refreshNativeWatchlist(attempt = 0) {
        const containers = [...document.querySelectorAll("#favoritesTab .itemsContainer")];
        if (!containers.length) {
            if (state.watchlistOpen && attempt < 20) window.setTimeout(() => refreshNativeWatchlist(attempt + 1), 50);
            return;
        }
        for (const container of containers) {
            if (typeof container.resume === "function") void container.resume({ refresh: true });
        }
    }

    function showNativeFavorites() {
        const favorite = navigationHosts()
            .map(favoriteNavigationItem)
            .find(item => item && !item.classList.contains("pw-watchlist-tab") && visible(item));
        const favoritesPageVisible = visible(document.querySelector("#favoritesTab"));
        if (favorite && !favoritesPageVisible) {
            state.nativeNavigation = true;
            favorite.click();
            window.setTimeout(() => {
                state.nativeNavigation = false;
                syncWatchlistNavigation();
            }, 0);
        } else {
            syncWatchlistNavigation();
            refreshNativeWatchlist();
        }
    }

    async function openWatchlist() {
        const firstOpen = !state.watchlistOpen;
        state.watchlistOpen = true;
        state.watchlistRequested = true;
        document.documentElement.classList.add("pw-watchlist-route-active");
        if (firstOpen) {
            const loaded = await loadState(true);
            if (!loaded) return;
            await normalizeStoredIds();
            installNativeItemsProvider();
            showNativeFavorites();
        } else {
            syncWatchlistNavigation();
        }
    }

    function closeWatchlist(clearUrl = true) {
        state.watchlistRequested = false;
        document.documentElement.classList.remove("pw-watchlist-route-active");
        if (clearUrl) removeWatchlistUrlMarker();
        if (!state.watchlistOpen) return;
        state.watchlistOpen = false;
        document.querySelectorAll(".pw-watchlist-tab").forEach(tab => {
            tab.classList.remove("emby-tab-button-active");
            tab.classList.remove("pw-watchlist-nav-active");
            tab.setAttribute("aria-selected", "false");
        });
    }

    async function synchronize() {
        state.api = apiClient();
        if (!state.api || !state.api.getCurrentUserId?.()) return;
        ensureWatchlistTab();
        ensureCardButtons();
        const wantsWatchlist = state.watchlistRequested || isWatchlistRoute();
        if (wantsWatchlist) {
            await openWatchlist();
        } else {
            await loadState();
        }
        await ensureDetailButton();
        if (!wantsWatchlist && state.watchlistOpen) closeWatchlist(false);
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
            const isNavigation = tab && navigationHosts().some(host => host.contains(tab));
            if (isNavigation && !tab.classList.contains("pw-watchlist-tab") && !state.nativeNavigation) closeWatchlist();
        }, true);
        document.addEventListener("viewshow", () => {
            if (!isWatchlistRoute()) closeWatchlist(false);
            schedule();
        });
        window.addEventListener("hashchange", () => {
            if (state.watchlistOpen && !isHomeRoute() && !isFavoriteListRoute()) {
                closeWatchlist();
                schedule();
                return;
            }
            state.watchlistRequested = isWatchlistRoute();
            if (!state.watchlistRequested) closeWatchlist(false);
            schedule();
        });
        window.addEventListener("popstate", () => {
            state.watchlistRequested = isWatchlistRoute();
            if (!state.watchlistRequested) closeWatchlist(false);
            schedule();
        });
        schedule();
    }

    start();
})();
