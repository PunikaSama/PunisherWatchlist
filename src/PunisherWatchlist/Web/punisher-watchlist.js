(function () {
    "use strict";

    if (window.__punisherWatchlistV121) return;
    window.__punisherWatchlistV121 = true;

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
        cardAliasQueue: new Set(),
        cardAliasTimer: 0,
        cardAliasLoading: false,
        observer: null,
        scheduleTimer: 0,
        watchlistOpen: false,
        watchlistRequested: isWatchlistRoute(),
        patchedApi: null,
        originalGetItems: null,
        providerActive: false
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

    function nativeWatchlistOptions(options, ids) {
        const result = { ...options, Ids: ids.join(","), IncludeItemTypes: "Movie,Series", StartIndex: 0, Limit: ids.length };
        delete result.Filters;
        delete result.filters;
        delete result.IsFavorite;
        delete result.isFavorite;
        delete result.SortBy;
        delete result.sortBy;
        delete result.SortOrder;
        delete result.sortOrder;
        delete result.Tags;
        delete result.tags;
        return result;
    }

    function orderWatchlistResult(result, ids, startIndex = 0, limit = ids.length) {
        const normalize = value => String(value || "").replace(/-/g, "").toLowerCase();
        const positions = new Map(ids.map((id, index) => [normalize(id), index]));
        const source = result?.Items || result?.items || [];
        const ordered = [...source]
            .filter(item => positions.has(normalize(item?.Id || item?.id)))
            .sort((left, right) => positions.get(normalize(left?.Id || left?.id)) - positions.get(normalize(right?.Id || right?.id)));
        const first = Math.max(0, Number(startIndex) || 0);
        const requested = Number(limit);
        const count = Number.isFinite(requested) && requested > 0 ? requested : ordered.length;
        const items = ordered.slice(first, first + count);
        const response = { ...(result || {}), Items: items, TotalRecordCount: ordered.length, StartIndex: first };
        if (result && "items" in result) response.items = items;
        if (result && "totalRecordCount" in result) response.totalRecordCount = ordered.length;
        if (result && "startIndex" in result) response.startIndex = first;
        return response;
    }

    function addNewest(itemId) {
        const normalized = normalizeId(itemId);
        state.ids = new Set([normalized, ...[...state.ids].filter(id => id !== normalized)]);
    }

    function shouldUseWatchlistProvider(watchlistOpen, providerActive) {
        return Boolean(watchlistOpen && providerActive);
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
            state.cardAliasQueue.clear();
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

    function watchlistHash() {
        const params = new URLSearchParams({
            serverId: state.api?.serverId?.() || "",
            type: "tag",
            "pw-watchlist": "1"
        });
        return `#/list?${params}`;
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

    function isStandaloneWatchlistRoute() {
        return /^#\/list(?:[?]|$)/i.test(location.hash) && /[?&]pw-watchlist=1(?:&|$)/i.test(location.hash);
    }

    function immediateToggleKey(itemId, button) {
        const sourceKey = normalizeId(itemId);
        const buttonKey = normalizeId(button?.dataset?.pwCanonicalId);
        const itemType = button?.dataset?.pwItemType || "";
        if (!buttonKey) return "";
        if (buttonKey !== sourceKey) return buttonKey;
        return /^(Episode|Season)$/i.test(itemType) ? "" : buttonKey;
    }

    async function toggle(itemId, button) {
        if (!itemId || button?.dataset?.busy === "true") return;
        if (button) button.dataset.busy = "true";
        const sourceKey = normalizeId(itemId);
        const effectiveKey = immediateToggleKey(itemId, button) || await canonicalClientId(itemId);
        const desired = !state.ids.has(effectiveKey);
        if (desired) addNewest(effectiveKey); else state.ids.delete(effectiveKey);
        writeLocalIds();
        syncCanonicalButtons(effectiveKey);
        try {
            const result = await apiJson(`/PunisherWatchlist/items/${encodeURIComponent(effectiveKey)}`, desired ? "PUT" : "DELETE");
            const active = result?.InWatchlist ?? result?.inWatchlist ?? desired;
            const canonicalKey = normalizeId(result?.ItemId ?? result?.itemId ?? effectiveKey);
            state.aliases.set(sourceKey, canonicalKey);
            state.ids.delete(sourceKey);
            state.ids.delete(effectiveKey);
            if (active) addNewest(canonicalKey); else state.ids.delete(canonicalKey);
            writeLocalIds();
            syncButtons(itemId);
            syncCanonicalButtons(canonicalKey);
            document.dispatchEvent(new CustomEvent("punisherwatchlistchange", { detail: { itemId, active } }));
            if (state.watchlistOpen) refreshWatchlistView();
        } catch (error) {
            console.error("PunisherWatchlist could not update the item.", error);
            if (desired) state.ids.delete(effectiveKey); else addNewest(effectiveKey);
            writeLocalIds();
            syncCanonicalButtons(effectiveKey);
            button?.classList.add("pw-watchlist-error");
            window.setTimeout(() => button?.classList.remove("pw-watchlist-error"), 900);
        } finally {
            if (button) delete button.dataset.busy;
        }
    }

    function updateButton(button, itemId) {
        const sourceKey = normalizeId(itemId);
        const canonicalKey = state.aliases.get(sourceKey) || sourceKey;
        const active = state.ids.has(canonicalKey);
        const changed = button.getAttribute("aria-pressed") !== String(active);
        button.dataset.pwCanonicalId = canonicalKey;
        button.classList.toggle("pw-watchlist-active", active);
        button.setAttribute("aria-pressed", String(active));
        button.setAttribute("aria-label", active ? "Remove from Watchlist" : "Add to Watchlist");
        button.setAttribute("title", active ? "Remove from Watchlist" : "Add to Watchlist");
        const icon = button.querySelector(".pw-watchlist-icon");
        if (icon && (changed || !icon.firstElementChild)) icon.innerHTML = eyeSvg(active);
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

    function syncCanonicalButtons(canonicalId) {
        const target = normalizeId(canonicalId);
        document.querySelectorAll(".pw-watchlist-button[data-pw-item-id]").forEach(button => {
            const sourceKey = normalizeId(button.dataset.pwItemId);
            const buttonKey = normalizeId(button.dataset.pwCanonicalId) || state.aliases.get(sourceKey) || sourceKey;
            if (buttonKey === target) updateButton(button, button.dataset.pwItemId);
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
        button.dataset.pwItemType = item?.Type || item?.type || "";
        const more = host.querySelector(".btnMoreCommands, [data-action='more'], button[title*='more' i], button[title*='mehr' i]") || host.lastElementChild;
        if (more) host.insertBefore(button, more); else host.appendChild(button);
    }

    function queueCard(card) {
        if (!(card instanceof HTMLElement) || isLibraryFolderCard(card)) return;
        const itemId = cardId(card);
        if (!itemId) return;
        const itemType = card.dataset.type || card.dataset.itemType || card.getAttribute("data-type") || "";
        if (!card.querySelector(":scope .pw-watchlist-card-button")) placeCardButton(card, itemId);
        const button = card.querySelector(":scope .pw-watchlist-card-button");
        if (button) button.dataset.pwItemType = itemType;
        if (/^(Episode|Season)$/i.test(itemType)) queueCardAliasResolution(itemId);
    }

    function applyCardAlias(itemId) {
        const sourceKey = normalizeId(itemId);
        const seriesId = parentSeriesId(state.itemCache.get(sourceKey));
        if (seriesId) state.aliases.set(sourceKey, seriesId);
        syncButtons(itemId);
    }

    function queueCardAliasResolution(itemId) {
        const sourceKey = normalizeId(itemId);
        if (!sourceKey) return;
        if (state.itemCache.has(sourceKey)) {
            applyCardAlias(sourceKey);
            return;
        }
        state.cardAliasQueue.add(sourceKey);
        if (state.cardAliasTimer || state.cardAliasLoading) return;
        state.cardAliasTimer = window.setTimeout(flushCardAliasQueue, 20);
    }

    async function flushCardAliasQueue() {
        state.cardAliasTimer = 0;
        if (state.cardAliasLoading || !state.cardAliasQueue.size) return;
        const ids = [...state.cardAliasQueue];
        state.cardAliasQueue.clear();
        state.cardAliasLoading = true;
        try {
            await loadItems(ids);
            ids.forEach(applyCardAlias);
        } catch (error) {
            console.warn("PunisherWatchlist could not resolve episode cards to their series.", error);
        } finally {
            state.cardAliasLoading = false;
            if (state.cardAliasQueue.size && !state.cardAliasTimer) {
                state.cardAliasTimer = window.setTimeout(flushCardAliasQueue, 20);
            }
        }
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

    function activateWatchlistRoute(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        state.watchlistRequested = true;
        document.documentElement.classList.add("pw-watchlist-route-active");
        document.querySelector(".MuiBackdrop-root, [class*='MuiBackdrop-root']")?.click?.();
        void openWatchlist();
    }

    function ensureWatchlistTab() {
        for (const host of navigationHosts()) {
            const favorite = favoriteNavigationItem(host);
            if (!favorite) {
                host.querySelectorAll(".pw-watchlist-tab:not(.pw-watchlist-drawer-link)").forEach(tab => tab.remove());
                continue;
            }
            let tab = host.querySelector(".pw-watchlist-tab:not(.pw-watchlist-drawer-link)");
            if (!tab) {
                tab = makeNavigationLink(host);
                tab.addEventListener("click", activateWatchlistRoute);
            }
            if (favorite.nextElementSibling !== tab) favorite.insertAdjacentElement("afterend", tab);
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
            if (!shouldUseWatchlistProvider(state.watchlistOpen, state.providerActive)) return original(userId, options);
            const ids = [...state.ids];
            if (!ids.length) return Promise.resolve({ Items: [], TotalRecordCount: 0, StartIndex: 0 });
            const startIndex = options.StartIndex ?? options.startIndex ?? 0;
            const limit = options.Limit ?? options.limit ?? ids.length;
            return original(userId, nativeWatchlistOptions(options, ids))
                .then(result => orderWatchlistResult(result, ids, startIndex, limit));
        };
    }

    function syncWatchlistNavigation() {
        document.querySelectorAll(".pw-watchlist-tab").forEach(tab => {
            tab.parentElement?.querySelectorAll(".emby-tab-button-active, [aria-selected='true']").forEach(other => {
                if (other !== tab) {
                    other.classList.remove("emby-tab-button-active", "Mui-selected", "navMenuOption-selected", "selected", "buttonActive", "pw-watchlist-nav-active");
                    other.setAttribute("aria-selected", "false");
                }
            });
            tab.classList.add("emby-tab-button-active", "pw-watchlist-nav-active");
            tab.setAttribute("aria-selected", "true");
        });
    }

    function refreshWatchlistView(attempt = 0) {
        const containers = [...document.querySelectorAll(".mainAnimatedPage:not(.hide) .itemsContainer, .page:not(.hide) .itemsContainer")];
        if (!containers.length) {
            if (state.watchlistOpen && attempt < 20) window.setTimeout(() => refreshWatchlistView(attempt + 1), 50);
            return;
        }
        for (const container of containers) {
            if (typeof container.refreshItems === "function") void container.refreshItems();
            else if (typeof container.resume === "function") void container.resume({ refresh: true });
        }
    }

    async function openWatchlist() {
        const firstOpen = !state.watchlistOpen;
        state.watchlistOpen = true;
        state.watchlistRequested = true;
        document.documentElement.classList.add("pw-watchlist-route-active");
        if (firstOpen) {
            const loaded = await loadState(true);
            if (!loaded) {
                state.watchlistOpen = false;
                window.setTimeout(schedule, 50);
                return;
            }
            state.providerActive = true;
            installNativeItemsProvider();
            const targetHash = watchlistHash();
            if (location.hash !== targetHash) location.hash = targetHash.slice(1);
            else refreshWatchlistView();
            syncWatchlistNavigation();
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
        state.providerActive = false;
        document.querySelectorAll(".pw-watchlist-tab").forEach(tab => {
            tab.classList.remove("emby-tab-button-active");
            tab.classList.remove("pw-watchlist-nav-active");
            tab.setAttribute("aria-selected", "false");
        });
    }

    async function synchronize() {
        ensureWatchlistTab();
        state.api = apiClient();
        if (!state.api || !state.api.getCurrentUserId?.()) {
            window.setTimeout(schedule, 50);
            return;
        }
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
        if (state.scheduleTimer) return;
        state.scheduleTimer = window.setTimeout(() => {
            state.scheduleTimer = 0;
            void synchronize();
        }, 16);
    }

    function start() {
        if (!document.body) {
            window.setTimeout(start, 25);
            return;
        }
        state.observer = new MutationObserver(schedule);
        state.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-id"] });
        document.addEventListener("click", event => {
            const tab = event.target instanceof Element ? event.target.closest(".emby-tab-button, [role='tab'], .MuiButtonBase-root") : null;
            const isNavigation = tab && navigationHosts().some(host => host.contains(tab));
            if (isNavigation && !tab.classList.contains("pw-watchlist-tab")) closeWatchlist();
        }, true);
        document.addEventListener("viewshow", () => {
            if (!isWatchlistRoute()) closeWatchlist(false);
            schedule();
        });
        window.addEventListener("hashchange", () => {
            state.watchlistRequested = isWatchlistRoute();
            if (!state.watchlistRequested) closeWatchlist(false);
            schedule();
        });
        window.addEventListener("popstate", () => {
            state.watchlistRequested = isWatchlistRoute();
            if (!state.watchlistRequested) closeWatchlist(false);
            schedule();
        });
        void synchronize();
    }

    start();
})();
