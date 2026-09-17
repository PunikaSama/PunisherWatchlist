const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'src', 'PunisherWatchlist', 'Web', 'punisher-watchlist.js'), 'utf8');
const style = fs.readFileSync(path.join(root, 'src', 'PunisherWatchlist', 'Web', 'punisher-watchlist.css'), 'utf8');

for (const token of ['PunisherWatchlist/items', 'pw-watchlist-tab', 'pw-watchlist-card-button', 'pw-watchlist-detail-button']) {
    if (!script.includes(token)) throw new Error(`Missing client feature: ${token}`);
}
for (const token of ['.pw-watchlist-page', '.pw-watchlist-button', '.pw-watchlist-grid']) {
    if (!style.includes(token)) throw new Error(`Missing stylesheet rule: ${token}`);
}
new Function(script);
console.log('PunisherWatchlist web assets validated.');
