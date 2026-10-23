<?php
declare(strict_types=1);

namespace Octri\Audit;

require_once __DIR__ . '/ExactJSON.php';

final class AuditException extends \RuntimeException
{
    public function __construct(
        public readonly string $auditCode,
        string $message,
        public readonly array $diagnostics,
    ) {
        parent::__construct($message);
    }
}

final class Auditor
{
    private \FFI $native;

    /** Without a path, loads the library bundled for this platform under native/. */
    public function __construct(?string $library = null)
    {
        $path = realpath($library ?? self::bundledLibrary());
        if ($path === false) {
            throw new \InvalidArgumentException(
                "Native library does not exist",
            );
        }
        $this->native = \FFI::cdef(
            "typedef struct Buffer Buffer; unsigned int octri_auditor_abi_version(void); Buffer *octri_auditor_call(const unsigned char *, size_t); unsigned char *octri_auditor_buffer_data(Buffer *); size_t octri_auditor_buffer_len(const Buffer *); void octri_auditor_buffer_free(Buffer *);",
            $path,
        );
        if ($this->native->octri_auditor_abi_version() !== 1) {
            throw new \RuntimeException("Expected auditor ABI version 1");
        }
    }

    private static function bundledLibrary(): string
    {
        $arch = match (php_uname("m")) {
            "x86_64", "amd64" => "x64",
            "aarch64", "arm64" => "arm64",
            default => php_uname("m"),
        };
        $file = PHP_OS_FAMILY === "Darwin"
            ? "liboctri_auditor_ffi.dylib"
            : "liboctri_auditor_ffi.so";
        return dirname(__DIR__) .
            "/native/" .
            strtolower(PHP_OS_FAMILY) .
            "-$arch/$file";
    }

    /** Raw native JSON preserves integers beyond PHP's decoded numeric range. */
    public function callJson(\stdClass $envelope): string
    {
        $request = json_encode(
            $envelope,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE,
        );
        $length = strlen($request);
        if ($length > 128 * 1024 * 1024) {
            throw new \InvalidArgumentException(
                "Auditor envelope exceeds 128 MiB",
            );
        }
        $input = $this->native->new("unsigned char[" . max(1, $length) . "]");
        \FFI::memcpy($input, $request, $length);
        $output = $this->native->octri_auditor_call($input, $length);
        if (\FFI::isNull($output)) {
            throw new \RuntimeException(
                "Native auditor returned a null buffer",
            );
        }
        try {
            return \FFI::string(
                $this->native->octri_auditor_buffer_data($output),
                $this->native->octri_auditor_buffer_len($output),
            );
        } finally {
            $this->native->octri_auditor_buffer_free($output);
        }
    }

    public function call(\stdClass $envelope): \stdClass
    {
        return ExactJSON::decode($this->callJson($envelope));
    }

    public function audit(\stdClass $request): \stdClass
    {
        return $this->result("audit", ["request" => $request]);
    }
    public function fix(\stdClass $request): \stdClass
    {
        return $this->result("fix", ["request" => $request]);
    }
    public function bundle(\stdClass $request): \stdClass
    {
        return $this->result("bundle", ["request" => $request]);
    }
    public function compare(\stdClass $before, \stdClass $after): \stdClass
    {
        return $this->result("compare", [
            "before" => $before,
            "after" => $after,
        ]);
    }
    public function export(\stdClass $report, string $format = "json"): mixed
    {
        return $this->result("export", [
            "report" => $report,
            "format" => $format,
        ]);
    }
    public function rules(): array
    {
        return $this->result("rules", []);
    }

    private function result(string $action, array $fields): mixed
    {
        $response = $this->call(
            (object) array_merge(
                ["abiVersion" => 1, "action" => $action],
                $fields,
            ),
        );
        if (property_exists($response, "Err")) {
            throw new AuditException(
                $response->Err->code,
                $response->Err->message,
                $response->Err->diagnostics ?? [],
            );
        }
        if (!property_exists($response, "Ok")) {
            throw new \RuntimeException("Invalid auditor response envelope");
        }
        return $response->Ok;
    }
}
