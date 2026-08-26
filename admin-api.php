<?php
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const ROOT = __DIR__;
const COLLECTION_FILE = ROOT . '/collection.json';
const PRODUCTS_FILE = ROOT . '/products.json';
const BACKUP_DIR = ROOT . '/backups';

$config = require ROOT . '/admin-config.php';
$action = $_GET['action'] ?? $_POST['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function json_out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function read_json_file($path) {
    if (!is_file($path)) {
        return null;
    }
    $raw = file_get_contents($path);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function write_json_file($path, $data) {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return false;
    }
    return file_put_contents($path, $json, LOCK_EX) !== false;
}

function require_auth() {
    if (empty($_SESSION['admin_ok'])) {
        json_out(['error' => 'Authentication required'], 401);
    }
}

function payload() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : $_POST;
}

function flatten_items($items, $path = [], $crumbs = []) {
    $out = [];
    foreach (array_values($items) as $index => $item) {
        if (!is_array($item)) {
            continue;
        }
        $nextPath = array_merge($path, [$index]);
        $nextCrumbs = array_merge($crumbs, [$item['name'] ?? 'Unnamed']);
        if (!empty($item['item']) && is_array($item['item'])) {
            $out = array_merge($out, flatten_items($item['item'], $nextPath, $nextCrumbs));
        } elseif (!empty($item['request'])) {
            $out[] = summarize_endpoint($item, $nextPath, $nextCrumbs);
        }
    }
    return $out;
}

function summarize_endpoint($item, $path, $crumbs) {
    $request = $item['request'];
    if (is_string($request)) {
        $request = ['method' => 'GET', 'url' => $request];
    }
    $url = $request['url'] ?? '';
    $pathParts = [];
    $query = [];
    if (is_array($url)) {
        $pathParts = $url['path'] ?? [];
        foreach ($url['query'] ?? [] as $row) {
            if (!empty($row['key'])) {
                $query[] = [
                    'key' => $row['key'],
                    'value' => isset($row['value']) ? (string)$row['value'] : '',
                    'disabled' => !empty($row['disabled']),
                ];
            }
        }
        $rawUrl = $url['raw'] ?? ('/' . implode('/', $pathParts));
    } else {
        $rawUrl = (string)$url;
    }

    $headers = [];
    foreach ($request['header'] ?? [] as $header) {
        if (!empty($header['key'])) {
            $headers[] = [
                'key' => $header['key'],
                'value' => $header['value'] ?? '',
                'disabled' => !empty($header['disabled']),
            ];
        }
    }

    $rawBody = '';
    $body = $request['body'] ?? null;
    if (is_array($body) && ($body['mode'] ?? '') === 'raw') {
        $rawBody = (string)($body['raw'] ?? '');
    }

    return [
        'id' => implode('-', $path),
        'name' => $item['name'] ?? 'Unnamed',
        'folder' => $crumbs[0] ?? 'General',
        'crumbs' => $crumbs,
        'method' => strtoupper($request['method'] ?? 'GET'),
        'url' => $rawUrl,
        'path' => '/' . implode('/', $pathParts),
        'description' => request_description($request),
        'docsKey' => docs_key(strtoupper($request['method'] ?? 'GET'), '/' . implode('/', $pathParts), $crumbs),
        'query' => $query,
        'headers' => $headers,
        'body' => $rawBody,
        'fields' => array_values(array_unique(array_merge(
            array_column($query, 'key'),
            extract_body_fields($rawBody)
        ))),
        'scripts' => endpoint_scripts($item),
    ];
}

function endpoint_scripts($item) {
    $out = array();
    foreach (isset($item['event']) ? $item['event'] : array() as $event) {
        if (!is_array($event)) {
            continue;
        }
        $listen = isset($event['listen']) ? (string)$event['listen'] : '';
        $exec = array();
        if (isset($event['script']['exec'])) {
            $exec = is_array($event['script']['exec']) ? $event['script']['exec'] : array((string)$event['script']['exec']);
        }
        if ($listen !== '' || $exec) {
            $out[] = array('listen' => $listen, 'exec' => $exec);
        }
    }
    return $out;
}

function extract_body_fields($raw) {
    $cleaned = preg_replace('#/\*.*?\*/#s', '', (string)$raw);
    $cleaned = preg_replace('#^\s*//.*$#m', '', $cleaned);
    $cleaned = preg_replace('/,\s*([}\]])/', '$1', $cleaned);
    $cleaned = preg_replace('/:\s*(\{\{[^}]+\}\})/', ': "$1"', $cleaned);
    $parsed = json_decode($cleaned, true);
    if (!is_array($parsed)) {
        return [];
    }
    return flatten_keys($parsed);
}

function flatten_keys($value, $prefix = '') {
    $keys = [];
    if (!is_array($value)) {
        return $prefix ? [$prefix] : [];
    }
    $isList = array_keys($value) === range(0, count($value) - 1);
    if ($isList) {
        foreach ($value as $i => $item) {
            $keys = array_merge($keys, flatten_keys($item, $prefix === '' ? "[$i]" : "{$prefix}[$i]"));
        }
        return $keys;
    }
    foreach ($value as $key => $item) {
        $path = $prefix === '' ? (string)$key : "{$prefix}.{$key}";
        if (is_array($item)) {
            $keys = array_merge($keys, flatten_keys($item, $path));
        } else {
            $keys[] = $path;
        }
    }
    return $keys;
}

function top_folders($items) {
    $folders = [];
    foreach ($items as $item) {
        if (!is_array($item) || empty($item['name'])) {
            continue;
        }
        $folders[] = $item['name'];
    }
    return $folders;
}

function suggest_product($folder, $products) {
    $hay = strtolower($folder);
    $best = null;
    $bestLen = 0;
    foreach ($products as $product) {
        $tests = array_merge(isset($product['keywords']) ? $product['keywords'] : array(), array(isset($product['name']) ? $product['name'] : ''));
        foreach ($tests as $test) {
            $test = strtolower(trim((string)$test));
            if ($test !== '' && strpos($hay, $test) !== false && strlen($test) > $bestLen) {
                $best = $product['id'];
                $bestLen = strlen($test);
            }
        }
    }
    return $best;
}

function collection_summary($collection, $productsData) {
    $items = $collection['item'] ?? [];
    $endpoints = flatten_items($items);
    $products = flatten_catalog(isset($productsData['products']) ? $productsData['products'] : array());
    $maps = isset($productsData['maps']) ? $productsData['maps'] : array();
    $folders = [];
    foreach (top_folders($items) as $name) {
        $assigned = $maps[$name] ?? suggest_product($name, $products);
        $count = 0;
        foreach ($endpoints as $ep) {
            if ($ep['folder'] === $name) {
                $count++;
            }
        }
        $folders[] = [
            'name' => $name,
            'endpoints' => $count,
            'suggestedProduct' => $assigned,
        ];
    }
    $pages = load_doc_pages();
    foreach ($endpoints as $i => $ep) {
        $key = isset($ep['docsKey']) ? $ep['docsKey'] : docs_key($ep['method'], $ep['path'], $ep['crumbs']);
        $endpoints[$i]['docsKey'] = $key;
        if (!empty($pages['endpoints'][$key]['html'])) {
            $endpoints[$i]['docsHtml'] = $pages['endpoints'][$key]['html'];
        } else {
            $endpoints[$i]['docsHtml'] = looks_like_html($ep['description']) ? $ep['description'] : '';
        }
    }
    return [
        'name' => $collection['info']['name'] ?? 'Untitled collection',
        'description' => $collection['info']['description'] ?? '',
        'folders' => $folders,
        'endpoints' => $endpoints,
        'variables' => array_values(array_filter(array_map(function ($v) {
            return isset($v['key']) ? $v['key'] : '';
        }, isset($collection['variable']) ? $collection['variable'] : []))),
        'endpointCount' => count($endpoints),
        'fieldCount' => array_sum(array_map(function ($ep) {
            return count($ep['fields']);
        }, $endpoints)),
    ];
}

function find_item_by_path($items, $parts) {
    $idx = (int)array_shift($parts);
    if (!isset($items[$idx]) || !is_array($items[$idx])) {
        return null;
    }
    if (!$parts) {
        return $items[$idx];
    }
    if (empty($items[$idx]['item'])) {
        return null;
    }
    return find_item_by_path($items[$idx]['item'], $parts);
}

function update_item_by_path(&$items, $parts, $patch) {
    $idx = (int)array_shift($parts);
    if (!isset($items[$idx]) || !is_array($items[$idx])) {
        return false;
    }
    if (!$parts) {
        if (isset($patch['name'])) {
            $items[$idx]['name'] = $patch['name'];
        }
        if (!isset($items[$idx]['request']) || !is_array($items[$idx]['request'])) {
            $items[$idx]['request'] = [];
        }
        if (array_key_exists('description', $patch)) {
            $items[$idx]['request']['description'] = sanitize_doc_html((string)$patch['description']);
        }
        if (isset($patch['method'])) {
            $items[$idx]['request']['method'] = strtoupper($patch['method']);
        }
        if (array_key_exists('body', $patch)) {
            $items[$idx]['request']['body'] = [
                'mode' => 'raw',
                'raw' => (string)$patch['body'],
                'options' => ['raw' => ['language' => 'json']],
            ];
        }
        if (isset($patch['query']) && is_array($patch['query'])) {
            if (!isset($items[$idx]['request']['url']) || !is_array($items[$idx]['request']['url'])) {
                $items[$idx]['request']['url'] = ['raw' => '', 'path' => [], 'query' => []];
            }
            $items[$idx]['request']['url']['query'] = $patch['query'];
        }
        if (isset($patch['headers']) && is_array($patch['headers'])) {
            $items[$idx]['request']['header'] = $patch['headers'];
        }
        return true;
    }
    if (empty($items[$idx]['item']) || !is_array($items[$idx]['item'])) {
        return false;
    }
    return update_item_by_path($items[$idx]['item'], $parts, $patch);
}

function backup_collection() {
    $path = active_collection_file();
    if (!$path || !is_file($path)) {
        return null;
    }
    if (!is_dir(BACKUP_DIR) && !mkdir(BACKUP_DIR, 0775, true) && !is_dir(BACKUP_DIR)) {
        return null;
    }
    $dest = BACKUP_DIR . '/collection-' . date('Ymd-His') . '.json';
    return copy($path, $dest) ? $dest : null;
}

function load_active_collection() {
    $path = active_collection_file();
    if ($path) {
        $data = read_json_file($path);
        if (is_array($data)) {
            return $data;
        }
    }
    return read_json_file(COLLECTION_FILE);
}

function parse_keywords($value) {
    $list = is_array($value) ? $value : explode(',', (string)$value);
    $out = array();
    foreach ($list as $item) {
        $item = trim((string)$item);
        if ($item !== '') {
            $out[] = $item;
        }
    }
    return array_values($out);
}

function slug_id($value, $fallback) {
    $id = preg_replace('/[^a-z0-9-]+/', '-', strtolower(trim((string)$value)));
    $id = trim($id, '-');
    return $id !== '' ? $id : uniqid($fallback);
}

function maps_from_products($products) {
    $maps = array();
    foreach ($products as $product) {
        if (!empty($product['folder'])) {
            $maps[$product['folder']] = $product['id'];
        }
    }
    return $maps;
}

function env_maps_from_products($products) {
    $maps = array();
    foreach ($products as $product) {
        if (!empty($product['folder']) && !empty($product['environmentId'])) {
            $maps[$product['folder']] = $product['environmentId'];
        }
    }
    return $maps;
}

function flatten_catalog($products) {
    $out = array();
    if (!is_array($products)) {
        return $out;
    }
    foreach ($products as $product) {
        if (!is_array($product)) {
            continue;
        }
        $children = isset($product['children']) && is_array($product['children']) ? $product['children'] : array();
        unset($product['children']);
        if (empty($product['kind'])) {
            $product['kind'] = 'product';
        }
        $out[] = $product;
        foreach ($children as $child) {
            if (!is_array($child) || empty($child['name'])) {
                continue;
            }
            $child['kind'] = 'service';
            if (!empty($product['id'])) {
                $child['productId'] = $product['id'];
            }
            unset($child['children']);
            $out[] = $child;
        }
    }
    return $out;
}

function clean_kind($value) {
    $kind = strtolower(trim((string)$value));
    if ($kind === 'service' || $kind === 'utility') {
        return $kind;
    }
    return 'product';
}

function clean_product_entry($product, $isChild) {
    if (!is_array($product) || empty($product['name'])) {
        return null;
    }
    $kind = $isChild ? 'service' : clean_kind(isset($product['kind']) ? $product['kind'] : 'product');
    $entry = array(
        'id' => slug_id(isset($product['id']) ? $product['id'] : $product['name'], $kind === 'service' ? 'service-' : 'product-'),
        'name' => trim((string)$product['name']),
        'kind' => $kind,
        'keywords' => parse_keywords(isset($product['keywords']) ? $product['keywords'] : ''),
        'folder' => trim((string)(isset($product['folder']) ? $product['folder'] : '')),
        'environmentId' => trim((string)(isset($product['environmentId']) ? $product['environmentId'] : '')),
        'docs' => sanitize_doc_html(isset($product['docs']) ? $product['docs'] : ''),
        'published' => product_is_published($product),
        'files' => clean_product_files(isset($product['files']) ? $product['files'] : array()),
        'icon' => preg_replace('/[^a-z0-9-]/', '', strtolower(trim((string)(isset($product['icon']) ? $product['icon'] : '')))),
    );
    $tree = product_tree($product);
    if ($tree) {
        $entry['tree'] = $tree;
    }
    $productId = trim((string)(isset($product['productId']) ? $product['productId'] : ''));
    if ($kind === 'service' && $productId !== '') {
        $entry['productId'] = $productId;
    }
    if ($entry['folder'] === '') {
        unset($entry['folder']);
    }
    if ($entry['environmentId'] === '') {
        unset($entry['environmentId']);
    }
    if ($entry['docs'] === '') {
        unset($entry['docs']);
    }
    if (empty($entry['files'])) {
        unset($entry['files']);
    }
    if ($entry['icon'] === '') {
        unset($entry['icon']);
    }
    return $entry;
}

function product_is_published($product) {
    if (!isset($product['published'])) {
        return true;
    }
    $value = $product['published'];
    if ($value === false || $value === 0 || $value === '0' || $value === 'false') {
        return false;
    }
    return true;
}

function clean_product_files($files) {
    $out = array();
    if (!is_array($files)) {
        return $out;
    }
    foreach ($files as $file) {
        if (!is_array($file)) {
            continue;
        }
        $id = preg_replace('/[^a-zA-Z0-9._-]/', '', (string)(isset($file['id']) ? $file['id'] : ''));
        $name = trim((string)(isset($file['name']) ? $file['name'] : ''));
        $filename = preg_replace('/[^a-zA-Z0-9._-]/', '', (string)(isset($file['filename']) ? $file['filename'] : ''));
        if ($id === '' || $name === '' || $filename === '') {
            continue;
        }
        $out[] = array(
            'id' => $id,
            'name' => $name,
            'filename' => $filename,
            'url' => trim((string)(isset($file['url']) ? $file['url'] : ('collection/product-files/' . $filename))),
            'size' => (int)(isset($file['size']) ? $file['size'] : 0),
            'uploadedAt' => (string)(isset($file['uploadedAt']) ? $file['uploadedAt'] : ''),
        );
    }
    return $out;
}

function product_tree($product) {
    if (!is_array($product)) {
        return array();
    }
    if (!empty($product['tree']) && is_array($product['tree'])) {
        return clean_tree($product['tree']);
    }
    return clean_tree(isset($product['flow']) ? $product['flow'] : array());
}

function clean_tree($nodes) {
    $out = array();
    if (!is_array($nodes)) {
        return $out;
    }
    foreach ($nodes as $node) {
        if (!is_array($node)) {
            continue;
        }
        $type = isset($node['type']) ? $node['type'] : '';
        $isFolder = ($type === 'folder') || (isset($node['children']) && is_array($node['children']) && $type !== 'step');
        if ($isFolder) {
            $name = trim((string)(isset($node['name']) ? $node['name'] : (isset($node['label']) ? $node['label'] : '')));
            if ($name === '') {
                $name = 'Folder';
            }
            $folder = array(
                'type' => 'folder',
                'id' => trim((string)(isset($node['id']) ? $node['id'] : '')),
                'name' => $name,
                'children' => clean_tree(isset($node['children']) ? $node['children'] : array()),
            );
            $seq = isset($node['seq']) ? intval($node['seq']) : 0;
            if ($seq > 0) {
                $folder['seq'] = $seq;
            }
            if ($folder['id'] === '') {
                $folder['id'] = uniqid('folder-');
            }
            $out[] = $folder;
            continue;
        }
        $step = clean_step($node);
        if ($step) {
            $out[] = $step;
        }
    }
    return $out;
}

function clean_step($step) {
    if (!is_array($step)) {
        return null;
    }
    $label = trim((string)(isset($step['label']) ? $step['label'] : ''));
    $endpointId = trim((string)(isset($step['endpointId']) ? $step['endpointId'] : ''));
    $docsKey = trim((string)(isset($step['docsKey']) ? $step['docsKey'] : ''));
    $name = trim((string)(isset($step['name']) ? $step['name'] : ''));
    if ($label === '' && $endpointId === '' && $docsKey === '' && $name === '') {
        return null;
    }
    $item = array(
        'type' => 'step',
        'id' => trim((string)(isset($step['id']) ? $step['id'] : '')),
        'label' => $label !== '' ? $label : ($name !== '' ? $name : 'Request'),
    );
    if ($item['id'] === '') {
        $item['id'] = uniqid('step-');
    }
    if ($endpointId !== '') {
        $item['endpointId'] = $endpointId;
    }
    if ($docsKey !== '') {
        $item['docsKey'] = $docsKey;
    }
    if ($name !== '') {
        $item['name'] = $name;
    }
    $method = strtoupper(trim((string)(isset($step['method']) ? $step['method'] : '')));
    if ($method !== '') {
        $item['method'] = $method;
    }
    $path = trim((string)(isset($step['path']) ? $step['path'] : ''));
    if ($path !== '') {
        $item['path'] = $path;
    }
    $folder = trim((string)(isset($step['folder']) ? $step['folder'] : ''));
    if ($folder !== '') {
        $item['folder'] = $folder;
    }
    if (!empty($step['headers']) && is_array($step['headers'])) {
        $item['headers'] = $step['headers'];
    }
    if (!empty($step['query']) && is_array($step['query'])) {
        $item['query'] = $step['query'];
    }
    if (isset($step['body']) && $step['body'] !== '') {
        $item['body'] = is_string($step['body']) ? $step['body'] : json_encode($step['body']);
    }
    $bodyMode = trim((string)(isset($step['bodyMode']) ? $step['bodyMode'] : ''));
    if ($bodyMode !== '') {
        $item['bodyMode'] = $bodyMode;
    }
    if (!empty($step['formData']) && is_array($step['formData'])) {
        $item['formData'] = $step['formData'];
    }
    if (!empty($step['urlencoded']) && is_array($step['urlencoded'])) {
        $item['urlencoded'] = $step['urlencoded'];
    }
    if (!empty($step['auth']) && is_array($step['auth'])) {
        $item['auth'] = $step['auth'];
    }
    if (!empty($step['scripts']) && is_array($step['scripts'])) {
        $item['scripts'] = $step['scripts'];
    }
    $url = trim((string)(isset($step['url']) ? $step['url'] : ''));
    if ($url !== '') {
        $item['url'] = $url;
    }
    if (isset($step['docsHtml']) && $step['docsHtml'] !== '') {
        $item['docsHtml'] = $step['docsHtml'];
    }
    $seq = isset($step['seq']) ? intval($step['seq']) : 0;
    if ($seq > 0) {
        $item['seq'] = $seq;
    }
    return $item;
}

function request_description($request) {
    $desc = isset($request['description']) ? $request['description'] : '';
    if (is_array($desc)) {
        return (string)(isset($desc['content']) ? $desc['content'] : '');
    }
    return is_string($desc) ? $desc : '';
}

function docs_key($method, $path, $crumbs) {
    $path = trim((string)$path);
    if ($path !== '' && $path !== '/') {
        return strtoupper((string)$method) . ' ' . $path;
    }
    return strtoupper((string)$method) . ' ' . implode('/', is_array($crumbs) ? $crumbs : array());
}

function looks_like_html($text) {
    return is_string($text) && preg_match('/<[a-z][\s\S]*>/i', $text);
}

function sanitize_doc_html($html) {
    $html = (string)$html;
    $html = preg_replace('#<(script|iframe|object|embed|form|link|meta|style)[^>]*>[\s\S]*?</\1>#i', '', $html);
    $html = preg_replace('#</?(script|iframe|object|embed|form|link|meta|style)[^>]*>#i', '', $html);
    $allowed = '<p><br><h2><h3><h4><strong><b><em><i><u><s><strike><sub><sup><ul><ol><li><a><img><pre><code><blockquote><span><div><hr><table><thead><tbody><tr><th><td><font>';
    $html = strip_tags($html, $allowed);
    $html = preg_replace('/\son[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html);
    $html = preg_replace('/javascript\s*:/i', '', $html);
    $html = preg_replace('/data\s*:/i', '', $html);
    return trim($html);
}

function probe_host($url, $label, $title = '') {
    $parts = parse_url($url);
    $host = isset($parts['host']) ? $parts['host'] : '';
    $ip = '';
    if ($host !== '') {
        $resolved = gethostbyname($host);
        if ($resolved && $resolved !== $host) {
            $ip = $resolved;
        }
    }
    $started = microtime(true);
    $httpStatus = 0;
    $error = '';
    $online = false;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 4);
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($ch, CURLOPT_USERAGENT, 'TakafulOman-API-Admin/1.0');
        curl_exec($ch);
        $httpStatus = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);
        $online = $httpStatus > 0;
        if (!$online && $curlErr) {
            $error = $curlErr;
        }
    } else {
        $ctx = stream_context_create(array(
            'http' => array(
                'method' => 'GET',
                'timeout' => 6,
                'ignore_errors' => true,
                'header' => "User-Agent: TakafulOman-API-Admin/1.0\r\n",
            ),
            'ssl' => array(
                'verify_peer' => false,
                'verify_peer_name' => false,
            ),
        ));
        $raw = @file_get_contents($url, false, $ctx);
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
            $httpStatus = (int) $m[1];
            $online = true;
        } elseif ($raw !== false) {
            $online = true;
            $httpStatus = 200;
        } else {
            $error = 'Could not reach host';
        }
    }
    $ms = (int) round((microtime(true) - $started) * 1000);
    return array(
        'id' => $label,
        'title' => $title,
        'url' => $url,
        'host' => $host,
        'ip' => $ip,
        'online' => $online,
        'httpStatus' => $httpStatus,
        'latencyMs' => $online ? $ms : null,
        'error' => $error,
        'checkedAt' => date('c'),
    );
}

require_once ROOT . '/collection-store.php';
ensure_storage();

switch ($action) {
    case 'session':
        json_out([
            'ok' => !empty($_SESSION['admin_ok']),
            'user' => $_SESSION['admin_user'] ?? null,
        ]);
        break;

    case 'login':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        $fails = (int)($_SESSION['login_fails'] ?? 0);
        if ($fails >= 8) {
            json_out(['error' => 'Too many attempts. Refresh later.'], 429);
        }
        $body = payload();
        $user = trim((string)($body['username'] ?? ''));
        $pass = (string)($body['password'] ?? '');
        $validUser = hash_equals((string)$config['username'], $user);
        $validPass = password_verify($pass, (string)$config['password_hash']);
        if (!$validUser || !$validPass) {
            $_SESSION['login_fails'] = $fails + 1;
            json_out(['error' => 'Invalid username or password'], 401);
        }
        $_SESSION['login_fails'] = 0;
        $_SESSION['admin_ok'] = true;
        $_SESSION['admin_user'] = $user;
        session_regenerate_id(true);
        json_out(['ok' => true, 'user' => $user]);
        break;

    case 'logout':
        $_SESSION = [];
        session_destroy();
        json_out(['ok' => true]);
        break;

    case 'change-password':
        require_auth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        $body = payload();
        $current = (string)(isset($body['current']) ? $body['current'] : '');
        $next = (string)(isset($body['next']) ? $body['next'] : '');
        $confirm = (string)(isset($body['confirm']) ? $body['confirm'] : '');
        if (!password_verify($current, (string)$config['password_hash'])) {
            json_out(['error' => 'Current password is incorrect.'], 400);
        }
        if (strlen($next) < 8) {
            json_out(['error' => 'New password must be at least 8 characters.'], 400);
        }
        if ($next !== $confirm) {
            json_out(['error' => 'New password and confirmation do not match.'], 400);
        }
        $config['password_hash'] = password_hash($next, PASSWORD_DEFAULT);
        $exported = "<?php\nreturn [\n    'username' => " . var_export($config['username'], true) . ",\n    'password_hash' => " . var_export($config['password_hash'], true) . ",\n];\n";
        if (file_put_contents(ROOT . '/admin-config.php', $exported, LOCK_EX) === false) {
            json_out(['error' => 'Could not write the new password. Check file permissions on admin-config.php.'], 500);
        }
        json_out(['ok' => true]);
        break;

    case 'host-status':
        $probed = array();
        foreach (load_hosts() as $item) {
            $probed[] = probe_host($item['url'], $item['id'], $item['title']);
        }
        $related = array();
        foreach (load_related_hosts() as $item) {
            $related[] = probe_host($item['url'], $item['id'], $item['title']);
        }
        json_out(array(
            'ok' => true,
            'hosts' => $probed,
            'relatedHosts' => $related,
        ));
        break;

    case 'hosts':
        json_out(array('ok' => true, 'hosts' => load_hosts(), 'relatedHosts' => load_related_hosts()));
        break;

    case 'save-hosts':
        require_auth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        $body = payload();
        $hosts = isset($body['hosts']) && is_array($body['hosts']) ? $body['hosts'] : array();
        $relatedHosts = isset($body['relatedHosts']) && is_array($body['relatedHosts']) ? $body['relatedHosts'] : null;
        if (!save_hosts($hosts, $relatedHosts)) {
            json_out(['error' => 'Add at least one host with a valid http(s) URL.'], 400);
        }
        json_out(array('ok' => true, 'hosts' => load_hosts(), 'relatedHosts' => load_related_hosts()));
        break;

    case 'overview':
        require_auth();
        $collection = load_active_collection() ?: ['item' => []];
        $productsData = read_json_file(PRODUCTS_FILE) ?: ['products' => [], 'maps' => []];
        $summary = collection_summary($collection, $productsData);
        $files = files_payload();
        json_out([
            'user' => $_SESSION['admin_user'] ?? 'admin',
            'collectionName' => $summary['name'],
            'endpointCount' => $summary['endpointCount'],
            'fieldCount' => $summary['fieldCount'],
            'folderCount' => count($summary['folders']),
            'productCount' => count($productsData['products'] ?? []),
            'collectionFileCount' => count($files['collections']),
            'environmentFileCount' => count($files['environments']),
            'updatedAt' => is_file(STORE_ACTIVE) ? date('c', filemtime(STORE_ACTIVE)) : (is_file(COLLECTION_FILE) ? date('c', filemtime(COLLECTION_FILE)) : null),
        ]);
        break;

    case 'products':
        require_auth();
        $productsData = read_json_file(PRODUCTS_FILE) ?: ['products' => [], 'maps' => []];
        $productsData['products'] = flatten_catalog(isset($productsData['products']) ? $productsData['products'] : array());
        json_out($productsData);
        break;

    case 'save-products':
        require_auth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        $body = payload();
        $products = $body['products'] ?? null;
        $maps = $body['maps'] ?? [];
        if (!is_array($products)) {
            json_out(['error' => 'products array is required'], 400);
        }
        $incoming = flatten_catalog($products);
        $clean = [];
        foreach ($incoming as $product) {
            $entry = clean_product_entry($product, false);
            if ($entry) {
                $clean[] = $entry;
            }
        }
        $cleanMaps = maps_from_products($clean);
        if (is_array($maps)) {
            foreach ($maps as $folder => $productId) {
                $folder = trim((string)$folder);
                $productId = trim((string)$productId);
                if ($folder !== '' && $productId !== '' && !isset($cleanMaps[$folder])) {
                    $cleanMaps[$folder] = $productId;
                }
            }
        }
        $folderEnvironments = env_maps_from_products($clean);
        $payloadOut = array(
            'maps' => $cleanMaps,
            'folderEnvironments' => $folderEnvironments,
            'products' => $clean,
            'updatedAt' => date('c'),
        );
        if (!write_json_file(PRODUCTS_FILE, $payloadOut)) {
            json_out(['error' => 'Could not save products'], 500);
        }
        json_out(array('ok' => true, 'products' => $clean, 'maps' => $cleanMaps, 'folderEnvironments' => $folderEnvironments, 'updatedAt' => $payloadOut['updatedAt']));
        break;

    case 'collection':
        require_auth();
        $collection = load_active_collection();
        $productsData = read_json_file(PRODUCTS_FILE) ?: ['products' => [], 'maps' => []];
        if (!$collection) {
            json_out([
                'name' => 'No collection yet',
                'description' => '',
                'folders' => [],
                'endpoints' => [],
                'variables' => [],
                'endpointCount' => 0,
                'fieldCount' => 0,
            ]);
        }
        json_out(collection_summary($collection, $productsData));
        break;

    case 'files':
        require_auth();
        json_out(files_payload());
        break;

    case 'save-env-value':
        require_auth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        $body = payload();
        $id = trim((string)(isset($body['id']) ? $body['id'] : ''));
        $key = trim((string)(isset($body['key']) ? $body['key'] : ''));
        $value = isset($body['value']) ? (string)$body['value'] : '';
        if ($id === '' || $key === '' || !update_environment_value($id, $key, $value)) {
            json_out(['error' => 'Could not update the environment variable. Map a saved environment to this product first.'], 400);
        }
        json_out(['ok' => true, 'key' => $key, 'value' => $value]);
        break;

    case 'save-environment':
        require_auth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        $body = payload();
        $id = trim((string)(isset($body['id']) ? $body['id'] : ''));
        $name = trim((string)(isset($body['name']) ? $body['name'] : ''));
        $values = isset($body['values']) && is_array($body['values']) ? $body['values'] : array();
        if ($id === '') {
            $json = array(
                'name' => $name !== '' ? $name : 'Admin environment',
                '_postman_variable_scope' => 'environment',
                'values' => values_map_to_rows($values),
            );
            $item = import_payload('environment', $json, 'admin-environment.json', false);
            if (!$item) {
                json_out(['error' => 'Could not create the environment.'], 500);
            }
            json_out(['ok' => true, 'id' => $item['id'], 'files' => files_payload()]);
        }
        if (!save_environment_values($id, $values, $name)) {
            json_out(['error' => 'Could not save the environment.'], 400);
        }
        json_out(['ok' => true, 'id' => $id, 'files' => files_payload()]);
        break;

    case 'download-environment':
        require_auth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        $body = payload();
        $id = trim((string)(isset($body['id']) ? $body['id'] : ''));
        $pack = environment_download_payload($id);
        if (!$pack) {
            json_out(['error' => 'No saved environment to download. Upload or save an environment first.'], 404);
        }
        json_out(array(
            'ok' => true,
            'id' => $pack['item']['id'],
            'name' => isset($pack['environment']['name']) ? $pack['environment']['name'] : $pack['item']['name'],
            'originalFilename' => isset($pack['item']['originalFilename']) ? $pack['item']['originalFilename'] : '',
            'environment' => $pack['environment'],
        ));
        break;

    case 'download-collection':
        require_auth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        $body = payload();
        $id = trim((string)(isset($body['id']) ? $body['id'] : ''));
        $pack = collection_download_payload($id);
        if (!$pack) {
            json_out(['error' => 'Collection not found.'], 404);
        }
        json_out(array(
            'ok' => true,
            'id' => $pack['item']['id'],
            'name' => isset($pack['item']['name']) ? $pack['item']['name'] : '',
            'originalFilename' => isset($pack['item']['originalFilename']) ? $pack['item']['originalFilename'] : '',
            'collection' => $pack['collection'],
        ));
        break;

    case 'activate-collection':
        require_auth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        $body = payload();
        $id = trim((string)($body['id'] ?? ''));
        if ($id === '' || !activate_collection($id)) {
            json_out(['error' => 'Collection not found'], 404);
        }
        json_out(['ok' => true, 'files' => files_payload()]);
        break;

    case 'delete-file':
        require_auth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        $body = payload();
        $id = trim((string)($body['id'] ?? ''));
        if ($id === '' || !delete_store_item($id)) {
            json_out(['error' => 'File not found'], 404);
        }
        json_out(['ok' => true, 'files' => files_payload()]);
        break;

    case 'upload-collection':
    case 'upload-environment':
        require_auth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        $expected = $action === 'upload-environment' ? 'environment' : 'collection';
        $raw = '';
        $originalName = 'upload.json';
        if (!empty($_FILES['file']['error']) && (int)$_FILES['file']['error'] !== UPLOAD_ERR_OK && (int)$_FILES['file']['error'] !== UPLOAD_ERR_NO_FILE) {
            $code = (int)$_FILES['file']['error'];
            if ($code === UPLOAD_ERR_INI_SIZE || $code === UPLOAD_ERR_FORM_SIZE) {
                json_out(['error' => 'The file is larger than the PHP upload limit. Use a collection under the server post_max_size, or raise upload_max_filesize in php.ini.'], 400);
            }
            json_out(['error' => 'Could not receive the uploaded file (PHP code ' . $code . ').'], 400);
        }
        if (!empty($_FILES['file']['tmp_name']) && is_uploaded_file($_FILES['file']['tmp_name'])) {
            $raw = file_get_contents($_FILES['file']['tmp_name']);
            $originalName = isset($_FILES['file']['name']) ? (string)$_FILES['file']['name'] : $originalName;
        } else {
            $body = payload();
            if (!empty($body['filename'])) {
                $originalName = (string)$body['filename'];
            }
            if (isset($body['collection']) || isset($body['environment'])) {
                $payloadJson = isset($body['collection']) ? $body['collection'] : $body['environment'];
                $raw = is_string($payloadJson) ? $payloadJson : json_encode($payloadJson);
            }
        }
        $raw = preg_replace('/^\xEF\xBB\xBF/', '', (string)$raw);
        if ($raw === '' || $raw === 'null') {
            json_out(['error' => 'No file content was received. The collection may be larger than PHP post_max_size.'], 400);
        }
        $json = json_decode($raw, true);
        if (!is_array($json)) {
            json_out(['error' => 'That file is not valid JSON.'], 400);
        }
        $detected = detect_upload_type($json);
        if ($detected !== $expected) {
            $hint = $expected === 'collection'
                ? 'Upload a valid Postman Collection v2 JSON file (the API repository).'
                : 'Upload a valid Postman Environment JSON file.';
            json_out(['error' => $hint], 400);
        }
        $item = import_payload($expected, $json, $originalName, $expected === 'collection');
        if (!$item) {
            json_out(['error' => 'Could not store the uploaded file'], 500);
        }
        $productsData = read_json_file(PRODUCTS_FILE) ?: ['products' => [], 'maps' => []];
        $summary = null;
        if ($expected === 'collection') {
            $summary = collection_summary($json, $productsData);
            $newMaps = $productsData['maps'] ?? [];
            foreach ($summary['folders'] as $folder) {
                if (empty($newMaps[$folder['name']]) && !empty($folder['suggestedProduct'])) {
                    $newMaps[$folder['name']] = $folder['suggestedProduct'];
                }
            }
            $productsData['maps'] = $newMaps;
            write_json_file(PRODUCTS_FILE, $productsData);
        } else {
            $active = load_active_collection();
            $summary = $active ? collection_summary($active, $productsData) : null;
        }
        json_out([
            'ok' => true,
            'item' => $item,
            'files' => files_payload(),
            'summary' => $summary,
            'maps' => $productsData['maps'] ?? [],
        ]);
        break;

    case 'save-endpoint':
        require_auth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        $body = payload();
        $id = trim((string)($body['id'] ?? ''));
        if ($id === '' || !preg_match('/^[0-9]+(-[0-9]+)*$/', $id)) {
            json_out(['error' => 'Valid endpoint id is required'], 400);
        }
        $path = active_collection_file();
        $collection = $path ? read_json_file($path) : null;
        if (!$collection) {
            json_out(['error' => 'Collection not found'], 404);
        }
        $ok = update_item_by_path($collection['item'], explode('-', $id), $body);
        if (!$ok) {
            json_out(['error' => 'Endpoint not found'], 404);
        }
        if (!write_json_file($path, $collection)) {
            json_out(['error' => 'Could not save collection'], 500);
        }
        publish_runtime();
        json_out(['ok' => true]);
        break;

    case 'save-maps':
        require_auth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        $body = payload();
        $productsData = read_json_file(PRODUCTS_FILE) ?: ['products' => [], 'maps' => []];
        $maps = $body['maps'] ?? [];
        if (!is_array($maps)) {
            json_out(['error' => 'maps object is required'], 400);
        }
        $cleanMaps = [];
        foreach ($maps as $folder => $productId) {
            $folder = trim((string)$folder);
            $productId = trim((string)$productId);
            if ($folder !== '' && $productId !== '') {
                $cleanMaps[$folder] = $productId;
            }
        }
        $productsData['maps'] = $cleanMaps;
        if (!write_json_file(PRODUCTS_FILE, $productsData)) {
            json_out(['error' => 'Could not save folder mapping'], 500);
        }
        json_out(['ok' => true, 'maps' => $cleanMaps]);
        break;

    case 'save-docs':
        require_auth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        $body = payload();
        $key = trim((string)($body['docsKey'] ?? ''));
        $id = trim((string)($body['id'] ?? ''));
        if ($key === '') {
            json_out(['error' => 'Documentation key is required'], 400);
        }
        $html = sanitize_doc_html(isset($body['html']) ? $body['html'] : '');
        $pages = load_doc_pages();
        $pages['updatedAt'] = date('c');
        $pages['endpoints'][$key] = array(
            'html' => $html,
            'name' => trim((string)($body['name'] ?? '')),
            'method' => strtoupper((string)($body['method'] ?? '')),
            'updatedAt' => date('c'),
        );
        if (!save_doc_pages($pages)) {
            json_out(['error' => 'Could not save documentation'], 500);
        }
        if ($id !== '' && preg_match('/^[0-9]+(-[0-9]+)*$/', $id)) {
            $path = active_collection_file();
            $collection = $path ? read_json_file($path) : null;
            if ($collection) {
                update_item_by_path($collection['item'], explode('-', $id), array('description' => $html));
                write_json_file($path, $collection);
                publish_runtime();
            }
        }
        json_out(['ok' => true, 'html' => $html, 'updatedAt' => $pages['endpoints'][$key]['updatedAt']]);
        break;

    case 'upload-doc-asset':
        require_auth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        if (empty($_FILES['file']['tmp_name']) || !is_uploaded_file($_FILES['file']['tmp_name'])) {
            json_out(['error' => 'Choose an image to upload'], 400);
        }
        $original = isset($_FILES['file']['name']) ? (string)$_FILES['file']['name'] : 'image';
        $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
        $allowed = array('png', 'jpg', 'jpeg', 'gif', 'webp');
        if (!in_array($ext, $allowed, true)) {
            json_out(['error' => 'Upload a PNG, JPG, GIF, or WebP image'], 400);
        }
        if (!empty($_FILES['file']['size']) && $_FILES['file']['size'] > 5 * 1024 * 1024) {
            json_out(['error' => 'Image must be 5 MB or smaller'], 400);
        }
        store_mkdir(STORE_DOC_MEDIA);
        $filename = 'img' . date('YmdHis') . substr(uniqid(), -4) . '.' . $ext;
        $dest = STORE_DOC_MEDIA . '/' . $filename;
        if (!move_uploaded_file($_FILES['file']['tmp_name'], $dest)) {
            json_out(['error' => 'Could not store the image'], 500);
        }
        json_out(array(
            'ok' => true,
            'url' => 'collection/docs/media/' . $filename,
            'filename' => $filename,
        ));
        break;

    case 'upload-product-file':
        require_auth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        $productId = trim((string)(isset($_POST['productId']) ? $_POST['productId'] : ''));
        if ($productId === '') {
            json_out(['error' => 'Product is required'], 400);
        }
        if (empty($_FILES['file']['tmp_name']) || !is_uploaded_file($_FILES['file']['tmp_name'])) {
            json_out(['error' => 'Choose a document to upload'], 400);
        }
        $original = isset($_FILES['file']['name']) ? (string)$_FILES['file']['name'] : 'document';
        $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
        $allowed = array('pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'zip');
        if (!in_array($ext, $allowed, true)) {
            json_out(['error' => 'Upload a PDF, Office document, image, text, or ZIP file'], 400);
        }
        if (!empty($_FILES['file']['size']) && $_FILES['file']['size'] > 15 * 1024 * 1024) {
            json_out(['error' => 'Document must be 15 MB or smaller'], 400);
        }
        $productsData = read_json_file(PRODUCTS_FILE) ?: array('products' => array(), 'maps' => array());
        $productsData['products'] = flatten_catalog(isset($productsData['products']) ? $productsData['products'] : array());
        $found = null;
        foreach ($productsData['products'] as $i => $product) {
            if (isset($product['id']) && $product['id'] === $productId) {
                $found = $i;
                break;
            }
        }
        if ($found === null) {
            json_out(['error' => 'Product not found'], 404);
        }
        store_mkdir(STORE_PRODUCT_FILES);
        $fileId = 'file' . date('YmdHis') . substr(uniqid(), -4);
        $filename = $fileId . '.' . $ext;
        $dest = STORE_PRODUCT_FILES . '/' . $filename;
        if (!move_uploaded_file($_FILES['file']['tmp_name'], $dest)) {
            json_out(['error' => 'Could not store the document'], 500);
        }
        $entry = array(
            'id' => $fileId,
            'name' => $original,
            'filename' => $filename,
            'url' => 'collection/product-files/' . $filename,
            'size' => (int)(isset($_FILES['file']['size']) ? $_FILES['file']['size'] : filesize($dest)),
            'uploadedAt' => date('c'),
        );
        if (!isset($productsData['products'][$found]['files']) || !is_array($productsData['products'][$found]['files'])) {
            $productsData['products'][$found]['files'] = array();
        }
        $productsData['products'][$found]['files'][] = $entry;
        $productsData['updatedAt'] = date('c');
        if (!write_json_file(PRODUCTS_FILE, $productsData)) {
            json_out(['error' => 'Could not save the document list'], 500);
        }
        json_out(array(
            'ok' => true,
            'file' => $entry,
            'files' => $productsData['products'][$found]['files'],
            'products' => $productsData['products'],
        ));
        break;

    case 'delete-product-file':
        require_auth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_out(['error' => 'POST required'], 405);
        }
        $body = payload();
        $productId = trim((string)(isset($body['productId']) ? $body['productId'] : ''));
        $fileId = trim((string)(isset($body['fileId']) ? $body['fileId'] : ''));
        if ($productId === '' || $fileId === '') {
            json_out(['error' => 'Product and file are required'], 400);
        }
        $productsData = read_json_file(PRODUCTS_FILE) ?: array('products' => array(), 'maps' => array());
        $productsData['products'] = flatten_catalog(isset($productsData['products']) ? $productsData['products'] : array());
        $found = null;
        foreach ($productsData['products'] as $i => $product) {
            if (isset($product['id']) && $product['id'] === $productId) {
                $found = $i;
                break;
            }
        }
        if ($found === null) {
            json_out(['error' => 'Product not found'], 404);
        }
        $kept = array();
        $removed = null;
        foreach (isset($productsData['products'][$found]['files']) ? $productsData['products'][$found]['files'] : array() as $file) {
            if (isset($file['id']) && $file['id'] === $fileId) {
                $removed = $file;
                continue;
            }
            $kept[] = $file;
        }
        if (!$removed) {
            json_out(['error' => 'Document not found'], 404);
        }
        if (!empty($removed['filename'])) {
            $path = STORE_PRODUCT_FILES . '/' . $removed['filename'];
            if (is_file($path)) {
                unlink($path);
            }
        }
        $productsData['products'][$found]['files'] = $kept;
        $productsData['updatedAt'] = date('c');
        if (!write_json_file(PRODUCTS_FILE, $productsData)) {
            json_out(['error' => 'Could not update the document list'], 500);
        }
        json_out(array(
            'ok' => true,
            'files' => $kept,
            'products' => $productsData['products'],
        ));
        break;

    default:
        json_out(['error' => 'Unknown action'], 404);
}
