// ========== DROPSHIP SALES REPORT ==========
//
// Weekly dropship numbers, read from the Worker's /sales/dropship route.
//
// DROPSHIP IS THREE CONDITIONS AND ALL THREE MATTER. Online (not point of
// sale), supplier brand footwear, fulfilled from Needham. Measured 2026-10-19
// over a fortnight, 1,203 of 1,515 orders were POS: counting them overstated
// revenue nearly 3x and turned a 2.4 percent rise into a 28 percent fall. The
// Worker does the filtering, this file only draws it.
//
// The route needs the WRITE SECRET on top of the bearer token. It is a read,
// but the bearer token is public by construction and revenue should not be
// readable by anyone who opens the bundle. Staff paste the secret once and it
// lives in localStorage.rhWriteSecret, the same place every write route takes
// it from.
//
// House style: no em dashes. Use commas, periods, or the word "to".

var SalesReport = {
    MARGIN: 0.30,          // owner's stated low estimate, shown as a guide only

    open: function () {
        var self = this;
        this._injectCss();
        var o = document.getElementById('sr-overlay');
        if (o) o.remove();
        o = document.createElement('div');
        o.id = 'sr-overlay';
        o.innerHTML = this._shellHTML();
        document.body.appendChild(o);
        document.body.classList.add('sr-open');
        o.querySelector('#sr-close').onclick = function () { self.close(); };
        o.addEventListener('keydown', function (e) { if (e.key === 'Escape') self.close(); });
        o.querySelector('#sr-weeks').onchange = function () { self.load(); };
        o.querySelector('#sr-reload').onclick = function () { self.load(); };
        this.load();
    },

    close: function () {
        var o = document.getElementById('sr-overlay');
        if (o) o.remove();
        document.body.classList.remove('sr-open');
    },

    _weeksBack: function (n) {
        // Monday of the week n weeks ago, in shop time, so a week is a week and
        // not a rolling 7 days that straddles two.
        var now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        var dow = (now.getDay() + 6) % 7;                 // Monday = 0
        now.setDate(now.getDate() - dow - (n - 1) * 7);
        return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') +
               '-' + String(now.getDate()).padStart(2, '0');
    },

    load: function () {
        var self = this;
        var weeks = parseInt(document.getElementById('sr-weeks').value, 10) || 2;
        var since = this._weeksBack(weeks);
        this._status('Loading since ' + since + '...');
        // Use the client's own accessor rather than reading localStorage here,
        // so there is one place that knows where the secret lives.
        var secret = (CatalogClient.writeSecret && CatalogClient.writeSecret()) || '';
        if (!secret) {
            this._status('This report needs the write secret. Paste it in the tagging tools once and it is remembered.', true);
            return;
        }
        fetch(CatalogClient._writeBase() + '/sales/dropship?since=' + encodeURIComponent(since), {
            headers: {
                'Authorization': 'Bearer ' + CatalogClient.CATALOG_TOKEN,
                'X-Write-Secret': secret
            }
        }).then(function (r) {
            if (r.status === 403) throw new Error('The write secret was rejected.');
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function (d) { self._render(d, since); })
          .catch(function (e) { self._status('Could not load: ' + e.message, true); });
    },

    _status: function (msg, isErr) {
        var el = document.getElementById('sr-status');
        if (!el) return;
        el.textContent = msg;
        el.className = 'sr-status' + (isErr ? ' err' : '');
    },

    // Split the days into calendar weeks, Monday start, so week on week is a
    // like for like comparison rather than a rolling window.
    _weeks: function (days) {
        var out = [];
        days.forEach(function (d) {
            var dt = new Date(d.date + 'T12:00:00');
            var dow = (dt.getDay() + 6) % 7;
            var mon = new Date(dt); mon.setDate(mon.getDate() - dow);
            var key = mon.toISOString().slice(0, 10);
            var w = out.filter(function (x) { return x.key === key; })[0];
            if (!w) { w = { key: key, pairs: 0, revenue: 0, days: [] }; out.push(w); }
            w.pairs += d.pairs; w.revenue += d.revenue; w.days.push(d);
        });
        return out.sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    },

    _money: function (n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },

    _render: function (d, since) {
        var self = this;
        this._status('');
        var weeks = this._weeks(d.days || []);
        var html = '';

        html += '<div class="sr-cards">';
        html += this._card('Pairs', (d.totals.pairs || 0).toLocaleString(), '');
        html += this._card('Revenue', this._money(d.totals.revenue), '');
        html += this._card('At ' + Math.round(this.MARGIN * 100) + '% margin', this._money(d.totals.revenue * this.MARGIN), 'your low estimate');
        html += '</div>';

        if (weeks.length >= 2) {
            var a = weeks[weeks.length - 2], b = weeks[weeks.length - 1];
            var dr = b.revenue - a.revenue, dq = b.pairs - a.pairs;
            var pct = a.revenue ? (100 * dr / a.revenue) : 0;
            html += '<div class="sr-wow ' + (dr >= 0 ? 'up' : 'down') + '">';
            html += '<strong>Week on week</strong> ' + (dr >= 0 ? 'up' : 'down') + ' ' +
                    Math.abs(pct).toFixed(1) + '% on revenue, ' + (dq >= 0 ? '+' : '') + dq + ' pairs. ' +
                    '<span class="sr-dim">Week of ' + a.key + ': ' + this._money(a.revenue) +
                    ' to week of ' + b.key + ': ' + this._money(b.revenue) + '.</span>';
            // The current week is almost always incomplete, and comparing a part
            // week against a whole one reads as a crash that is not there.
            html += '<div class="sr-note">The latest week is still running, so it is not a complete comparison.</div>';
            html += '</div>';
        }

        html += '<div class="sr-grid">';
        html += '<div><h3>By week</h3><table class="sr-t"><tr><th>Week of</th><th>Pairs</th><th>Revenue</th></tr>';
        weeks.slice().reverse().forEach(function (w) {
            html += '<tr><td>' + w.key + '</td><td>' + w.pairs + '</td><td>' + self._money(w.revenue) + '</td></tr>';
        });
        html += '</table></div>';

        html += '<div><h3>By brand</h3><table class="sr-t"><tr><th>Brand</th><th>Pairs</th><th>Revenue</th></tr>';
        (d.brands || []).forEach(function (b) {
            html += '<tr><td>' + b.brand + '</td><td>' + b.pairs + '</td><td>' + self._money(b.revenue) + '</td></tr>';
        });
        html += '</table></div></div>';

        html += '<h3>By day</h3><table class="sr-t sr-days"><tr><th>Date</th><th>Day</th><th>Pairs</th><th>Revenue</th></tr>';
        (d.days || []).slice().reverse().forEach(function (x) {
            var dt = new Date(x.date + 'T12:00:00');
            html += '<tr><td>' + x.date + '</td><td class="sr-dim">' + dt.toLocaleDateString('en-US', { weekday: 'short' }) +
                    '</td><td>' + x.pairs + '</td><td>' + self._money(x.revenue) + '</td></tr>';
        });
        html += '</table>';

        // What was NOT counted, said out loud. A number that quietly excludes
        // things is worse than one that shows its workings.
        html += '<div class="sr-foot">';
        html += '<div><strong>Dropship means</strong> ' + d.definition + '.</div>';
        html += '<div>Scanned ' + d.scanned.orders + ' orders since ' + since + ': ' +
                d.scanned.online + ' online, ' + d.scanned.posExcluded + ' point of sale excluded, ' +
                d.scanned.cancelledOrTest + ' cancelled or test.</div>';
        if ((d.excludedByLocation || []).length) {
            html += '<div>Online supplier footwear shipped from elsewhere, NOT counted as dropship: ' +
                (d.excludedByLocation.map(function (x) {
                    return x.location + ' ' + x.pairs + 'pr ' + self._money(x.revenue);
                }).join(', ')) + '.</div>';
        }
        html += '<div>Refunds are not deducted. The margin figure is a flat ' +
                Math.round(this.MARGIN * 100) + '% estimate, not real cost data.</div>';
        html += '</div>';

        document.getElementById('sr-body').innerHTML = html;
    },

    _card: function (label, value, sub) {
        return '<div class="sr-card"><div class="sr-card-l">' + label + '</div>' +
               '<div class="sr-card-v">' + value + '</div>' +
               (sub ? '<div class="sr-card-s">' + sub + '</div>' : '') + '</div>';
    },

    _shellHTML: function () {
        return '' +
        '<div class="sr-panel">' +
          '<div class="sr-top">' +
            '<div><div class="sr-eyebrow">The Run House</div><div class="sr-title">Dropship sales</div></div>' +
            '<button id="sr-close" class="sr-x">&times;</button>' +
          '</div>' +
          '<div class="sr-controls">' +
            '<select id="sr-weeks" class="sr-sel">' +
              '<option value="2">Last 2 weeks</option>' +
              '<option value="4" selected>Last 4 weeks</option>' +
              '<option value="8">Last 8 weeks</option>' +
              '<option value="13">Last 13 weeks</option>' +
            '</select>' +
            '<button id="sr-reload" class="sr-sel">Refresh</button>' +
          '</div>' +
          '<div id="sr-status" class="sr-status"></div>' +
          '<div id="sr-body" class="sr-body"></div>' +
        '</div>';
    },

    _injectCss: function () {
        if (document.getElementById('sr-css')) return;
        var s = document.createElement('style');
        s.id = 'sr-css';
        s.textContent = `
        body.sr-open { overflow: hidden; }
        #sr-overlay { position: fixed; inset: 0; z-index: 4000; background: #0d131f; display: flex; }
        .sr-panel { flex: 1; display: flex; flex-direction: column; max-width: 1100px; margin: 0 auto; width: 100%; }
        .sr-top { display: flex; align-items: flex-start; justify-content: space-between; padding: 22px 26px 12px; }
        .sr-eyebrow { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: #94a9c5; font-weight: 700; }
        .sr-title { font-size: 24px; font-weight: 700; letter-spacing: -.5px; color: #eef4fc; margin-top: 4px; }
        .sr-x { background: none; border: 0; color: #9fb2cc; font-size: 26px; line-height: 1; cursor: pointer; padding: 4px 8px; }
        .sr-x:hover { color: #fff; }
        .sr-controls { display: flex; gap: 10px; padding: 4px 26px 12px; }
        .sr-sel { padding: 9px 12px; background: #131b28; border: 1px solid rgba(120,170,230,.28); color: #dfeaf7; font-size: 13.5px; font-family: inherit; cursor: pointer; }
        .sr-status { padding: 0 26px 10px; font-size: 12.5px; color: #a4b8d2; }
        .sr-status.err { color: #ff9db0; }
        .sr-body { flex: 1; overflow-y: auto; padding: 0 26px 40px; color: #dfeaf7; }
        .sr-cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
        .sr-card { flex: 1; min-width: 180px; background: #131b28; border: 1px solid rgba(120,170,230,.18); padding: 14px 16px; }
        .sr-card-l { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #94a9c5; font-weight: 700; }
        .sr-card-v { font-size: 26px; font-weight: 700; color: #eef4fc; margin-top: 6px; }
        .sr-card-s { font-size: 11.5px; color: #8fa3bd; margin-top: 3px; }
        .sr-wow { background: #131b28; border-left: 3px solid #4c9bff; padding: 12px 16px; margin-bottom: 18px; font-size: 13.5px; }
        .sr-wow.up { border-left-color: #35d07f; }
        .sr-wow.down { border-left-color: #ff9db0; }
        .sr-note { font-size: 11.5px; color: #8fa3bd; margin-top: 5px; }
        .sr-dim { color: #8fa3bd; }
        .sr-grid { display: flex; gap: 18px; flex-wrap: wrap; }
        .sr-grid > div { flex: 1; min-width: 260px; }
        .sr-body h3 { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #94a9c5; margin: 18px 0 8px; }
        .sr-t { width: 100%; border-collapse: collapse; font-size: 13px; }
        .sr-t th { text-align: left; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: #8fa3bd; font-weight: 700; padding: 6px 8px; border-bottom: 1px solid rgba(120,170,230,.18); }
        .sr-t td { padding: 6px 8px; border-bottom: 1px solid rgba(120,170,230,.08); }
        .sr-t td:nth-child(n+3) { text-align: right; }
        .sr-days td:nth-child(2) { text-align: left; }
        .sr-foot { margin-top: 22px; padding-top: 14px; border-top: 1px solid rgba(120,170,230,.18); font-size: 12px; color: #8fa3bd; line-height: 1.7; }
        .sr-foot strong { color: #c9d8ea; }
        `;
        document.head.appendChild(s);
    }
};
