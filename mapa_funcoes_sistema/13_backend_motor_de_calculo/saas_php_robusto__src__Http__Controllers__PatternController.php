<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Domain\Pattern\Calculator;
use App\Domain\Pattern\Exporter;
use App\Http\Controllers\Api\BaseController;

final class PatternController extends BaseController
{
    public function __construct(
        private readonly Calculator $calculator = new Calculator(),
        private readonly Exporter $exporter = new Exporter()
    ) {}

    public function calculate(Request $request, array $params): Response
    {
        unset($params);
        $input = $request->body;
        if (isset($request->body['input']) && is_array($request->body['input'])) {
            $input = $request->body['input'];
        }

        return $this->ok([
            'result' => $this->calculator->calculate($input),
        ]);
    }

    public function exportFiles(Request $request, array $params): Response
    {
        unset($params);
        $input = $request->body;
        if (isset($request->body['input']) && is_array($request->body['input'])) {
            $input = $request->body['input'];
        }

        $result = $this->calculator->calculate($input);
        return $this->ok([
            'result' => $result,
            'files' => $this->exporter->buildExportFiles($result),
        ]);
    }
}
