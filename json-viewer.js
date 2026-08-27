(function (global) {
    function escapeHtml(text) {
        return String(text ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[ch]));
    }

    function parse(text) {
        const raw = String(text ?? '');
        try {
            return { ok: true, value: JSON.parse(raw) };
        } catch (e) {
            return { ok: false, value: raw };
        }
    }

    function childPath(parent, key, isArr) {
        if (isArr) return `${parent}[${key}]`;
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(key))) return `${parent}.${key}`;
        return `${parent}[${JSON.stringify(String(key))}]`;
    }

    function valueClass(value) {
        if (value === null) return 'json-null';
        const t = typeof value;
        if (t === 'string') return 'json-string';
        if (t === 'number') return 'json-number';
        if (t === 'boolean') return 'json-bool';
        return 'json-string';
    }

    function displayValue(value) {
        if (value === null) return 'null';
        if (typeof value === 'string') return JSON.stringify(value);
        return String(value);
    }

    function keyHtml(key, isIndex) {
        if (key == null || key === '') return '';
        if (isIndex) return `<span class="json-index">${escapeHtml(String(key))}</span><span class="json-colon">: </span>`;
        return `<span class="json-key">${escapeHtml(JSON.stringify(String(key)))}</span><span class="json-colon">: </span>`;
    }

    function previewLabel(value) {
        if (Array.isArray(value)) return `Array(${value.length})`;
        const n = Object.keys(value || {}).length;
        return n ? `{${n}}` : '{}';
    }

    function nodeHtml(value, key, path, isLast, collapsed, keyIsIndex) {
        const comma = isLast ? '' : '<span class="json-comma">,</span>';
        if (value !== null && typeof value === 'object') {
            const isArr = Array.isArray(value);
            const entries = isArr ? value.map((item, i) => [i, item]) : Object.keys(value).map((k) => [k, value[k]]);
            const open = isArr ? '[' : '{';
            const close = isArr ? ']' : '}';
            const isCollapsed = collapsed && collapsed.has(path);
            const kids = entries.map(([k, v], i) => nodeHtml(v, k, childPath(path, k, isArr), i === entries.length - 1, collapsed, isArr)).join('');
            return `<div class="json-node${isCollapsed ? ' is-collapsed' : ''}" data-kind="object" data-path="${escapeHtml(path)}">
                <div class="json-line">
                    <button class="json-toggle" type="button" aria-label="Collapse"></button>
                    ${keyHtml(key, keyIsIndex)}<span class="json-brace">${open}</span><span class="json-preview">${escapeHtml(previewLabel(value))}</span>
                </div>
                <div class="json-children">${kids}</div>
                <div class="json-close"><span class="json-brace">${close}</span>${comma}</div>
            </div>`;
        }
        return `<div class="json-node json-leaf" data-kind="leaf" data-path="${escapeHtml(path)}">
            <div class="json-line"><span class="json-indent"></span>${keyHtml(key, keyIsIndex)}<span class="json-val ${valueClass(value)}">${escapeHtml(displayValue(value))}</span>${comma}</div>
        </div>`;
    }

    function treeHtml(value, collapsed) {
        return `<div class="json-tree" id="responseJsonTree">${nodeHtml(value, null, '$', true, collapsed)}</div>`;
    }

    function highlight(text, query) {
        const src = String(text ?? '');
        const q = String(query ?? '');
        if (!q) return escapeHtml(src);
        const lower = src.toLowerCase();
        const needle = q.toLowerCase();
        let out = '';
        let from = 0;
        let i = lower.indexOf(needle, from);
        while (i >= 0) {
            out += escapeHtml(src.slice(from, i));
            out += `<mark class="json-hit">${escapeHtml(src.slice(i, i + q.length))}</mark>`;
            from = i + q.length;
            i = lower.indexOf(needle, from);
        }
        return out + escapeHtml(src.slice(from));
    }

    function targetSpans(node) {
        return node.querySelectorAll(':scope > .json-line > .json-key, :scope > .json-line > .json-index, :scope > .json-line > .json-val');
    }

    function restoreSpan(span) {
        if (span.hasAttribute('data-raw')) span.textContent = span.getAttribute('data-raw');
    }

    function applyCollapsed(tree, collapsed) {
        if (!tree) return;
        tree.querySelectorAll('.json-node[data-kind="object"]').forEach((node) => {
            node.classList.toggle('is-collapsed', Boolean(collapsed && collapsed.has(node.dataset.path)));
        });
    }

    function applySearch(tree, query) {
        if (!tree) return { count: 0 };
        const q = String(query || '').trim();
        const nodes = tree.querySelectorAll('.json-node');
        nodes.forEach((node) => {
            node.classList.remove('is-filtered', 'is-match');
            targetSpans(node).forEach(restoreSpan);
        });
        if (!q) {
            return { count: 0 };
        }
        const matched = new Set();
        const ownHits = new Set();
        nodes.forEach((node) => {
            let hit = false;
            targetSpans(node).forEach((span) => {
                if (!span.hasAttribute('data-raw')) span.setAttribute('data-raw', span.textContent);
                const text = span.getAttribute('data-raw') || '';
                if (text.toLowerCase().indexOf(q.toLowerCase()) >= 0) {
                    hit = true;
                    span.innerHTML = highlight(text, q);
                }
            });
            if (hit) {
                ownHits.add(node);
                let walk = node;
                while (walk && walk.classList && walk.classList.contains('json-node')) {
                    matched.add(walk);
                    walk = walk.parentElement ? walk.parentElement.closest('.json-node') : null;
                }
                node.querySelectorAll('.json-node').forEach((child) => matched.add(child));
            }
        });
        nodes.forEach((node) => {
            const keep = matched.has(node);
            node.classList.toggle('is-filtered', !keep);
            node.classList.toggle('is-match', ownHits.has(node));
            if (keep) node.classList.remove('is-collapsed');
        });
        return { count: tree.querySelectorAll('mark.json-hit').length };
    }

    function applyTextSearch(el, query, original) {
        if (!el) return { count: 0 };
        const src = original == null ? el.textContent : String(original);
        const q = String(query || '').trim();
        if (!q) {
            el.textContent = src;
            return { count: 0 };
        }
        el.innerHTML = highlight(src, q);
        return { count: el.querySelectorAll('mark.json-hit').length };
    }

    function toggleNode(node, collapsed) {
        if (!node || node.dataset.kind !== 'object') return;
        const next = !node.classList.contains('is-collapsed');
        node.classList.toggle('is-collapsed', next);
        if (!collapsed) return;
        if (next) collapsed.add(node.dataset.path);
        else collapsed.delete(node.dataset.path);
    }

    function setAllCollapsed(tree, collapsed, collapse) {
        if (!tree) return;
        tree.querySelectorAll('.json-node[data-kind="object"]').forEach((node) => {
            node.classList.toggle('is-collapsed', collapse);
            if (!collapsed) return;
            if (collapse) collapsed.add(node.dataset.path);
            else collapsed.delete(node.dataset.path);
        });
    }

    function stepHit(root, delta, index) {
        const hits = root ? [...root.querySelectorAll('mark.json-hit')] : [];
        if (!hits.length) return 0;
        const next = ((index || 0) + delta + hits.length * 20) % hits.length;
        hits.forEach((mark, i) => mark.classList.toggle('is-current', i === next));
        hits[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return next;
    }

    function collectSuggestions(root) {
        const seen = new Set();
        const out = [];
        const add = (raw) => {
            let s = String(raw || '').trim();
            if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
            if (s.endsWith(',')) s = s.slice(0, -1).trim();
            if (!s || s.length > 160) return;
            const key = s.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            out.push(s);
        };
        if (!root) return out;
        root.querySelectorAll('.json-key, .json-val, .json-index').forEach((el) => {
            add(el.getAttribute('data-raw') || el.textContent);
        });
        root.querySelectorAll('tbody td').forEach((el) => add(el.textContent));
        const raw = root.querySelector('#responseRawBody');
        if (raw) String(raw.textContent || '').split(/[\s,;:"'{}[\]\n]+/).forEach(add);
        return out;
    }

    function attachSuggestions(input, items) {
        if (!input) return;
        const wrap = input.closest('.response-search-wrap');
        if (!wrap) return;
        let box = wrap.querySelector('.response-suggest');
        if (!box) {
            box = document.createElement('div');
            box.className = 'response-suggest';
            box.hidden = true;
            wrap.appendChild(box);
        }
        const list = items || [];
        let active = -1;
        let hits = [];

        const close = () => {
            box.hidden = true;
            box.innerHTML = '';
            active = -1;
            hits = [];
        };

        const paint = () => {
            [...box.children].forEach((el, i) => el.classList.toggle('is-active', i === active));
            box.children[active]?.scrollIntoView({ block: 'nearest' });
        };

        const open = (query) => {
            const needle = String(query || '').trim().toLowerCase();
            if (!needle) {
                close();
                return;
            }
            hits = list.filter((item) => item.toLowerCase().includes(needle) && item.toLowerCase() !== needle).slice(0, 12);
            if (!hits.length) {
                close();
                return;
            }
            box.hidden = false;
            box.innerHTML = hits.map((item, i) => `<button class="response-suggest-item" type="button" data-index="${i}">${highlight(item, query)}</button>`).join('');
            active = -1;
            paint();
        };

        const pick = (index) => {
            const value = hits[index];
            if (value == null) return;
            input.value = value;
            close();
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
        };

        input.addEventListener('input', () => open(input.value));
        input.addEventListener('keydown', (e) => {
            if (box.hidden) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                active = active < 0 ? 0 : (active + 1) % hits.length;
                paint();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                active = active < 0 ? hits.length - 1 : (active - 1 + hits.length) % hits.length;
                paint();
            } else if (e.key === 'Enter') {
                if (active >= 0) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    pick(active);
                } else {
                    close();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        }, true);
        box.addEventListener('mousedown', (e) => {
            const item = e.target.closest('.response-suggest-item');
            if (!item) return;
            e.preventDefault();
            pick(Number(item.dataset.index));
        });
        input.addEventListener('blur', () => setTimeout(close, 120));
    }

    global.JsonViewer = {
        parse: parse,
        treeHtml: treeHtml,
        toggleNode: toggleNode,
        setAllCollapsed: setAllCollapsed,
        applySearch: applySearch,
        applyCollapsed: applyCollapsed,
        applyTextSearch: applyTextSearch,
        stepHit: stepHit,
        highlight: highlight,
        escapeHtml: escapeHtml,
        collectSuggestions: collectSuggestions,
        attachSuggestions: attachSuggestions,
    };
})(window);
