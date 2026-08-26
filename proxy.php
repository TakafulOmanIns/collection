<?php
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST required']);
    exit;
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON payload']);
    exit;
}

$url = trim((string)($payload['url'] ?? ''));
$method = strtoupper((string)($payload['method'] ?? 'GET'));
$headersIn = $payload['headers'] ?? [];
$body = $payload['body'] ?? null;

if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $url)) {
    http_response_code(400);
    echo json_encode(['error' => 'A valid http(s) URL is required. Set the host variable in Environment.']);
    exit;
}

$allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
if (!in_array($method, $allowedMethods, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Unsupported method']);
    exit;
}

$headerLines = [];
if (is_array($headersIn)) {
    foreach ($headersIn as $key => $value) {
        if (is_int($key) && is_array($value)) {
            $name = $value['key'] ?? $value['name'] ?? '';
            $val = $value['value'] ?? '';
        } else {
            $name = $key;
            $val = $value;
        }
        $name = trim((string)$name);
        $val = (string)$val;
        if ($name === '' || preg_match('/[\r\n]/', $name . $val)) {
            continue;
        }
        $headerLines[] = $name . ': ' . $val;
    }
}

$started = microtime(true);

if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => $headerLines,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);

    if ($body !== null && $body !== '' && !in_array($method, ['GET', 'HEAD'], true)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, is_string($body) ? $body : json_encode($body));
    }

    $raw = curl_exec($ch);
    $error = curl_error($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    if ($raw === false) {
        http_response_code(502);
        echo json_encode(['error' => $error ?: 'Request failed']);
        exit;
    }

    $rawHeaders = substr($raw, 0, $headerSize);
    $responseBody = substr($raw, $headerSize);
    $headerMap = [];
    foreach (preg_split("/\r\n|\n|\r/", $rawHeaders) as $line) {
        if (strpos($line, ':') !== false) {
            list($hName, $hVal) = explode(':', $line, 2);
            $headerMap[trim($hName)] = trim($hVal);
        }
    }

    echo json_encode([
        'status' => $status,
        'headers' => $headerMap,
        'body' => $responseBody,
        'timeMs' => (int)round((microtime(true) - $started) * 1000),
        'size' => strlen($responseBody),
    ]);
    exit;
}

$contextHeaders = implode("\r\n", $headerLines);
$options = [
    'http' => [
        'method' => $method,
        'header' => $contextHeaders,
        'ignore_errors' => true,
        'timeout' => 60,
    ],
];
if ($body !== null && $body !== '' && !in_array($method, ['GET', 'HEAD'], true)) {
    $options['http']['content'] = is_string($body) ? $body : json_encode($body);
}

$raw = @file_get_contents($url, false, stream_context_create($options));
$statusLine = $http_response_header[0] ?? 'HTTP/1.1 0';
preg_match('/\s(\d{3})\s/', $statusLine, $m);
$headerMap = [];
foreach ($http_response_header ?? [] as $line) {
    if (strpos($line, ':') !== false) {
        list($hName, $hVal) = explode(':', $line, 2);
        $headerMap[trim($hName)] = trim($hVal);
    }
}

echo json_encode([
    'status' => isset($m[1]) ? (int)$m[1] : 0,
    'headers' => $headerMap,
    'body' => $raw === false ? '' : $raw,
    'timeMs' => (int)round((microtime(true) - $started) * 1000),
    'size' => $raw === false ? 0 : strlen($raw),
    'error' => $raw === false ? 'Request failed' : null,
]);
