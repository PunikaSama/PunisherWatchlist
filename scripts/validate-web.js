const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'src', 'PunisherWatchlist', 'Web', 'punisher-watchlist.js'), 'utf8');
const style = fs.readFileSync(path.join(root, 'src', 'PunisherWatchlist', 'Web', 'punisher-watchlist.css'), 'utf8');

for (const token of ['PunisherWatchlist/items', 'pw-watchlist-tab', 'pw-watchlist-card-button', 'pw-watchlist-detail-button', 'MuiAppBar-root', 'favoriteButton', 'pw-watchlist-card-button-adjacent', 'pw-watchlist-drawer-link', 'placeAfterFavorites', 'pw-watchlist=1']) {
    if (!script.includes(token)) throw new Error(`Missing client feature: ${token}`);
}
for (const token of ['.pw-watchlist-page', '.pw-watchlist-button', '.pw-watchlist-grid', '.pw-watchlist-home-hidden > :not(.pw-watchlist-page)', '.pw-watchlist-card-button-adjacent:is(', '.card:hover .pw-watchlist-card-button', '@media (hover: none)']) {
    if (!style.includes(token)) throw new Error(`Missing stylesheet rule: ${token}`);
}
new Function(script);
console.log('PunisherWatchlist web assets validated.');
