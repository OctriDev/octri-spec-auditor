<?php
declare(strict_types=1);
require __DIR__ . "/src/Auditor.php";
$auditor = new \Octri\Audit\Auditor($argv[1]);
$input = json_decode(
    stream_get_contents(STDIN),
    false,
    512,
    JSON_THROW_ON_ERROR,
);
if ($input->abiVersion !== 1 || !in_array($input->action, ["audit", "fix", "bundle", "compare", "export", "rules"], true)) {
    echo $auditor->callJson($input);
} else {
    $value = match ($input->action) {
        "audit" => $auditor->audit($input->request),
        "fix" => $auditor->fix($input->request),
        "bundle" => $auditor->bundle($input->request),
        "compare" => $auditor->compare($input->before, $input->after),
        "export" => $auditor->export($input->report, $input->format),
        "rules" => $auditor->rules(),
    };
    echo json_encode((object) ["Ok" => $value], JSON_THROW_ON_ERROR);
}
