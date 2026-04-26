<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Core\Request;

final class SystemController extends BaseController
{
    public function health(Request $request, array $params)
    {
        unset($request, $params);
        return $this->ok(['status' => 'online', 'app' => 'saas_php_robusto']);
    }
}
