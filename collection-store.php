<?php
const STORE_ROOT = __DIR__ . '/collection';
const STORE_COLLECTIONS = STORE_ROOT . '/collections';
const STORE_ENVIRONMENTS = STORE_ROOT . '/environments';
const STORE_INDEX = STORE_ROOT . '/index.json';
const STORE_ACTIVE = STORE_ROOT . '/active.json';
const STORE_ENV_VALUES = STORE_ROOT . '/env-values.json';
const STORE_DOCS = STORE_ROOT . '/docs';
const STORE_DOC_PAGES = STORE_DOCS . '/pages.json';
const STORE_DOC_MEDIA = STORE_DOCS . '/media';
const STORE_PRODUCT_FILES = STORE_ROOT . '/product-files';
const STORE_HOSTS = STORE_ROOT . '/hosts.json';
const LEGACY_COLLECTION = __DIR__ . '/collection.json';

function store_mkdir($path) {
    if (!is_dir($path) && !mkdir($path, 0775, true) && !is_dir($path)) {
        return false;
    }
    return true;
}

function default_index() {
    return array(
        'activeCollectionId' => null,
        'activeEnvironmentId' => null,
        'items' => array(),
    );
}

function load_index() {
    $data = read_json_file(STORE_INDEX);
    if (!is_array($data) || !isset($data['items'])) {
        return default_index();
    }
    if (!isset($data['activeCollectionId'])) {
        $data['activeCollectionId'] = null;
    }
    if (!isset($data['activeEnvironmentId'])) {
        $data['activeEnvironmentId'] = null;
    }
    return $data;
}

function save_index($index) {
    return write_json_file(STORE_INDEX, $index);
}

function new_store_id($prefix) {
    return $prefix . date('YmdHis') . substr(uniqid(), -4);
}

function ensure_storage() {
    store_mkdir(STORE_ROOT);
    store_mkdir(STORE_COLLECTIONS);
    store_mkdir(STORE_ENVIRONMENTS);
    store_mkdir(STORE_DOCS);
    store_mkdir(STORE_DOC_MEDIA);
    store_mkdir(STORE_PRODUCT_FILES);
    if (!is_file(STORE_INDEX)) {
        save_index(default_index());
    }
    if (!is_file(STORE_DOC_PAGES)) {
        write_json_file(STORE_DOC_PAGES, array('endpoints' => array()));
    }
    if (!is_file(STORE_HOSTS)) {
        write_json_file(STORE_HOSTS, array('hosts' => default_hosts()));
    }
    $index = load_index();
    $hasCollection = false;
    foreach ($index['items'] as $item) {
        if (isset($item['type']) && $item['type'] === 'collection') {
            $hasCollection = true;
            break;
        }
    }
    if (!$hasCollection && is_file(LEGACY_COLLECTION)) {
        $json = read_json_file(LEGACY_COLLECTION);
        if (is_array($json) && !empty($json['item'])) {
            import_payload('collection', $json, 'collection.json', false);
            $index = load_index();
        }
    }
    if (empty($index['activeEnvironmentId'])) {
        $env = latest_environment_item($index);
        if ($env) {
            $index['activeEnvironmentId'] = $env['id'];
            save_index($index);
        }
    }
    publish_runtime();
}

function detect_upload_type($json) {
    if (!is_array($json)) {
        return null;
    }
    $hasItems = !empty($json['item']) && is_array($json['item']);
    $hasValues = isset($json['values']) && is_array($json['values']);
    $scope = isset($json['_postman_variable_scope']) ? $json['_postman_variable_scope'] : '';
    if ($hasItems && !$hasValues) {
        return 'collection';
    }
    if ($hasValues && ($scope === 'environment' || !$hasItems)) {
        return 'environment';
    }
    if ($hasItems) {
        return 'collection';
    }
    return null;
}

function count_store_endpoints($items) {
    $count = 0;
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        if (!empty($item['item']) && is_array($item['item'])) {
            $count += count_store_endpoints($item['item']);
        } elseif (!empty($item['request'])) {
            $count++;
        }
    }
    return $count;
}

function top_folder_names($collection) {
    $names = array();
    foreach (isset($collection['item']) ? $collection['item'] : array() as $item) {
        if (is_array($item) && !empty($item['name'])) {
            $names[] = $item['name'];
        }
    }
    return $names;
}

function environment_keys($json) {
    $keys = array();
    foreach (isset($json['values']) ? $json['values'] : array() as $row) {
        if (is_array($row) && !empty($row['key'])) {
            $keys[] = $row['key'];
        }
    }
    return $keys;
}

function environment_values($json) {
    $out = array();
    foreach (isset($json['values']) ? $json['values'] : array() as $row) {
        if (!is_array($row) || empty($row['key'])) {
            continue;
        }
        if (isset($row['enabled']) && !$row['enabled']) {
            continue;
        }
        $out[$row['key']] = isset($row['value']) ? (string)$row['value'] : '';
    }
    return $out;
}

function update_environment_value($id, $key, $value) {
    $index = load_index();
    $item = find_store_item($index, $id);
    if (!$item || $item['type'] !== 'environment' || $key === '') {
        return false;
    }
    $path = store_path_for($item);
    $json = read_json_file($path);
    if (!is_array($json)) {
        $json = array(
            'id' => $id,
            'name' => isset($item['name']) ? $item['name'] : $key,
            'values' => array(),
        );
    }
    if (!isset($json['values']) || !is_array($json['values'])) {
        $json['values'] = array();
    }
    $found = false;
    foreach ($json['values'] as $i => $row) {
        if (is_array($row) && isset($row['key']) && $row['key'] === $key) {
            $json['values'][$i]['value'] = $value;
            $json['values'][$i]['enabled'] = true;
            $found = true;
            break;
        }
    }
    if (!$found) {
        $json['values'][] = array(
            'key' => $key,
            'value' => $value,
            'type' => 'default',
            'enabled' => true,
        );
    }
    if (!write_json_file($path, $json)) {
        return false;
    }
    $index['activeEnvironmentId'] = $id;
    save_index($index);
    publish_runtime();
    return true;
}

function values_map_to_rows($values) {
    $rows = array();
    if (!is_array($values)) {
        return $rows;
    }
    $keys = array_keys($values);
    $isList = $keys === range(0, count($values) - 1);
    if ($isList) {
        foreach ($values as $row) {
            if (!is_array($row) || empty($row['key'])) {
                continue;
            }
            $rows[] = array(
                'key' => trim((string)$row['key']),
                'value' => isset($row['value']) ? (string)$row['value'] : '',
                'type' => 'default',
                'enabled' => true,
            );
        }
        return $rows;
    }
    foreach ($values as $key => $value) {
        $key = trim((string)$key);
        if ($key === '') {
            continue;
        }
        $rows[] = array(
            'key' => $key,
            'value' => is_array($value) ? '' : (string)$value,
            'type' => 'default',
            'enabled' => true,
        );
    }
    return $rows;
}

function save_environment_values($id, $values, $name) {
    $index = load_index();
    $item = find_store_item($index, $id);
    if (!$item || $item['type'] !== 'environment') {
        return false;
    }
    $path = store_path_for($item);
    $json = read_json_file($path);
    if (!is_array($json)) {
        $json = array(
            'id' => $id,
            'name' => $item['name'],
            '_postman_variable_scope' => 'environment',
            'values' => array(),
        );
    }
    $name = trim((string)$name);
    if ($name !== '') {
        $json['name'] = $name;
    }
    $json['values'] = values_map_to_rows($values);
    if (!isset($json['_postman_variable_scope'])) {
        $json['_postman_variable_scope'] = 'environment';
    }
    if (!write_json_file($path, $json)) {
        return false;
    }
    foreach ($index['items'] as $i => $it) {
        if (isset($it['id']) && $it['id'] === $id) {
            $index['items'][$i]['keys'] = environment_keys($json);
            $index['items'][$i]['variableCount'] = count($index['items'][$i]['keys']);
            if ($name !== '') {
                $index['items'][$i]['name'] = $name;
            }
            $index['activeEnvironmentId'] = $id;
            break;
        }
    }
    save_index($index);
    publish_runtime();
    return true;
}

function store_path_for($item) {
    $dir = $item['type'] === 'environment' ? STORE_ENVIRONMENTS : STORE_COLLECTIONS;
    return $dir . '/' . $item['filename'];
}

function find_store_item($index, $id) {
    foreach ($index['items'] as $item) {
        if (isset($item['id']) && $item['id'] === $id) {
            return $item;
        }
    }
    return null;
}

function import_payload($type, $json, $originalName, $makeActive) {
    $index = load_index();
    $id = new_store_id($type === 'environment' ? 'env' : 'col');
    $filename = $id . '.json';
    $uploadedAt = date('c');
    $item = array(
        'id' => $id,
        'type' => $type,
        'name' => $type === 'environment'
            ? (isset($json['name']) ? $json['name'] : 'Environment')
            : (isset($json['info']['name']) ? $json['info']['name'] : 'Collection'),
        'originalFilename' => $originalName,
        'filename' => $filename,
        'uploadedAt' => $uploadedAt,
    );
    if ($type === 'collection') {
        $item['folders'] = top_folder_names($json);
        $item['folderCount'] = count($item['folders']);
        $item['endpointCount'] = count_store_endpoints(isset($json['item']) ? $json['item'] : array());
        $path = STORE_COLLECTIONS . '/' . $filename;
    } else {
        $item['keys'] = environment_keys($json);
        $item['variableCount'] = count($item['keys']);
        $path = STORE_ENVIRONMENTS . '/' . $filename;
    }
    if (!write_json_file($path, $json)) {
        return null;
    }
    $index['items'][] = $item;
    if ($type === 'collection' && ($makeActive || empty($index['activeCollectionId']))) {
        $index['activeCollectionId'] = $id;
    }
    if ($type === 'environment') {
        $index['activeEnvironmentId'] = $id;
    }
    save_index($index);
    publish_runtime();
    return $item;
}

function latest_collection_item($index) {
    $latest = null;
    foreach ($index['items'] as $item) {
        if (!isset($item['type']) || $item['type'] !== 'collection') {
            continue;
        }
        if ($latest === null || strcmp($item['uploadedAt'], $latest['uploadedAt']) > 0) {
            $latest = $item;
        }
    }
    return $latest;
}

function latest_environment_item($index) {
    $latest = null;
    foreach ($index['items'] as $item) {
        if (!isset($item['type']) || $item['type'] !== 'environment') {
            continue;
        }
        if ($latest === null || strcmp($item['uploadedAt'], $latest['uploadedAt']) > 0) {
            $latest = $item;
        }
    }
    return $latest;
}

function environment_download_payload($id) {
    $index = load_index();
    $id = trim((string)$id);
    $item = $id !== '' ? find_store_item($index, $id) : null;
    if (!$item || $item['type'] !== 'environment') {
        $activeId = isset($index['activeEnvironmentId']) ? $index['activeEnvironmentId'] : null;
        $item = $activeId ? find_store_item($index, $activeId) : null;
    }
    if (!$item || $item['type'] !== 'environment') {
        $item = latest_environment_item($index);
    }
    if (!$item || $item['type'] !== 'environment') {
        return null;
    }
    $json = read_json_file(store_path_for($item));
    if (!is_array($json)) {
        return null;
    }
    if (empty($json['name']) && !empty($item['name'])) {
        $json['name'] = $item['name'];
    }
    if (!isset($json['_postman_variable_scope'])) {
        $json['_postman_variable_scope'] = 'environment';
    }
    if (!isset($json['values']) || !is_array($json['values'])) {
        $json['values'] = array();
    }
    return array(
        'item' => $item,
        'environment' => $json,
    );
}

function collection_download_payload($id) {
    $index = load_index();
    $id = trim((string)$id);
    $item = $id !== '' ? find_store_item($index, $id) : null;
    if (!$item || $item['type'] !== 'collection') {
        return null;
    }
    $json = read_json_file(store_path_for($item));
    if (!is_array($json)) {
        return null;
    }
    return array(
        'item' => $item,
        'collection' => $json,
    );
}

function active_collection_file() {
    $index = load_index();
    $id = $index['activeCollectionId'];
    $item = $id ? find_store_item($index, $id) : latest_collection_item($index);
    if (!$item) {
        return null;
    }
    $path = store_path_for($item);
    return is_file($path) ? $path : null;
}

function publish_runtime() {
    $index = load_index();
    $activeId = $index['activeCollectionId'];
    $active = $activeId ? find_store_item($index, $activeId) : latest_collection_item($index);
    if ($active && $active['type'] === 'collection') {
        $src = store_path_for($active);
        if (is_file($src)) {
            copy($src, STORE_ACTIVE);
            copy($src, LEGACY_COLLECTION);
            $index['activeCollectionId'] = $active['id'];
            save_index($index);
        }
    }
    $envs = array();
    foreach ($index['items'] as $item) {
        if ($item['type'] !== 'environment') {
            continue;
        }
        $json = read_json_file(store_path_for($item));
        $envs[$item['id']] = array(
            'name' => $item['name'],
            'values' => $json ? environment_values($json) : array(),
        );
    }
    if (!$envs) {
        file_put_contents(STORE_ENV_VALUES, '{}', LOCK_EX);
    } else {
        write_json_file(STORE_ENV_VALUES, $envs);
    }
}

function delete_store_item($id) {
    $index = load_index();
    $kept = array();
    $removed = null;
    foreach ($index['items'] as $item) {
        if ($item['id'] === $id) {
            $removed = $item;
            continue;
        }
        $kept[] = $item;
    }
    if (!$removed) {
        return false;
    }
    $path = store_path_for($removed);
    if (is_file($path)) {
        unlink($path);
    }
    $index['items'] = $kept;
    if ($index['activeCollectionId'] === $id) {
        $next = latest_collection_item($index);
        $index['activeCollectionId'] = $next ? $next['id'] : null;
    }
    if (isset($index['activeEnvironmentId']) && $index['activeEnvironmentId'] === $id) {
        $nextEnv = latest_environment_item($index);
        $index['activeEnvironmentId'] = $nextEnv ? $nextEnv['id'] : null;
    }
    save_index($index);
    publish_runtime();
    return true;
}

function activate_collection($id) {
    $index = load_index();
    $item = find_store_item($index, $id);
    if (!$item || $item['type'] !== 'collection') {
        return false;
    }
    $index['activeCollectionId'] = $id;
    save_index($index);
    publish_runtime();
    return true;
}

function files_payload() {
    $index = load_index();
    $collections = array();
    $environments = array();
    foreach ($index['items'] as $item) {
        if ($item['type'] === 'environment') {
            $item['active'] = (isset($index['activeEnvironmentId']) && $index['activeEnvironmentId'] === $item['id']);
            $environments[] = $item;
        } else {
            $item['active'] = ($index['activeCollectionId'] === $item['id']);
            $collections[] = $item;
        }
    }
    usort($collections, function ($a, $b) {
        return strcmp($b['uploadedAt'], $a['uploadedAt']);
    });
    usort($environments, function ($a, $b) {
        return strcmp($b['uploadedAt'], $a['uploadedAt']);
    });
    return array(
        'activeCollectionId' => $index['activeCollectionId'],
        'activeEnvironmentId' => isset($index['activeEnvironmentId']) ? $index['activeEnvironmentId'] : null,
        'collections' => $collections,
        'environments' => $environments,
    );
}

function default_doc_pages() {
    return array('endpoints' => array());
}

function load_doc_pages() {
    $data = read_json_file(STORE_DOC_PAGES);
    if (!is_array($data) || !isset($data['endpoints']) || !is_array($data['endpoints'])) {
        return default_doc_pages();
    }
    return $data;
}

function save_doc_pages($pages) {
    return write_json_file(STORE_DOC_PAGES, $pages);
}

function default_related_hosts() {
    return array(
        array(
            'id' => 'motor-claim',
            'title' => 'Motor claim',
            'url' => 'https://claimsonline.takafuloman.om/',
        ),
        array(
            'id' => 'inspection',
            'title' => 'Inspection',
            'url' => 'https://takafulomanpreinspectionlive.azurewebsites.net/',
        ),
        array(
            'id' => 'e-insurance',
            'title' => 'E-insurance',
            'url' => 'https://oman-insurance.com/',
        ),
        array(
            'id' => 'whatsapp',
            'title' => 'WhatsApp',
            'url' => 'https://takafulinsoman.mehery.com/',
        ),
    );
}

function default_hosts() {
    return array(
        array(
            'id' => 'live',
            'title' => 'Live',
            'url' => 'https://sellonline.takafuloman.om/',
        ),
        array(
            'id' => 'uat',
            'title' => 'UAT',
            'url' => 'https://uatsellonline.takafuloman.om/',
        ),
    );
}

function normalize_host_entries($hosts) {
    $clean = array();
    $used = array();
    if (!is_array($hosts)) {
        return $clean;
    }
    foreach ($hosts as $item) {
        if (!is_array($item)) {
            continue;
        }
        $title = trim((string)(isset($item['title']) ? $item['title'] : ''));
        $url = trim((string)(isset($item['url']) ? $item['url'] : ''));
        if ($url === '' || !preg_match('#^https?://#i', $url)) {
            continue;
        }
        $id = preg_replace('/[^a-z0-9-]/', '', strtolower(trim((string)(isset($item['id']) ? $item['id'] : $title))));
        if ($id === '') {
            $id = 'host-' . (count($clean) + 1);
        }
        $base = $id;
        $n = 2;
        while (isset($used[$id])) {
            $id = $base . '-' . $n;
            $n++;
        }
        $used[$id] = true;
        $clean[] = array(
            'id' => $id,
            'title' => $title !== '' ? $title : $id,
            'url' => $url,
        );
    }
    return $clean;
}

function load_hosts() {
    $data = read_json_file(STORE_HOSTS);
    if (!is_array($data) || !isset($data['hosts']) || !is_array($data['hosts']) || !$data['hosts']) {
        return default_hosts();
    }
    $out = normalize_host_entries($data['hosts']);
    return $out ? $out : default_hosts();
}

function load_related_hosts() {
    $data = read_json_file(STORE_HOSTS);
    if (!is_array($data) || !array_key_exists('relatedHosts', $data)) {
        return default_related_hosts();
    }
    return normalize_host_entries($data['relatedHosts']);
}

function save_hosts($hosts, $relatedHosts = null) {
    $clean = normalize_host_entries($hosts);
    if (!$clean) {
        return false;
    }
    $payload = array('hosts' => $clean);
    if ($relatedHosts !== null) {
        $payload['relatedHosts'] = normalize_host_entries($relatedHosts);
    } else {
        $payload['relatedHosts'] = load_related_hosts();
    }
    return write_json_file(STORE_HOSTS, $payload);
}
