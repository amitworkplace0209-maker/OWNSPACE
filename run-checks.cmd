@echo off
setlocal

echo.
echo ============================================
echo  Ownspece - All verification gates
echo ============================================
echo.

set FAILED=0

echo === typecheck ===
npm run typecheck
if errorlevel 1 (
    echo typecheck: FAILED
    set FAILED=1
) else (
    echo typecheck: PASSED
)

echo === lint ===
npm run lint
if errorlevel 1 (
    echo lint: FAILED
    set FAILED=1
) else (
    echo lint: PASSED
)

echo === build ===
npm run build
if errorlevel 1 (
    echo build: FAILED
    set FAILED=1
) else (
    echo build: PASSED
)

echo === test ===
npm test
if errorlevel 1 (
    echo test: FAILED
    set FAILED=1
) else (
    echo test: PASSED
)

echo.
if %FAILED%==1 (
    echo One or more checks FAILED.
    exit /b 1
) else (
    echo All checks PASSED.
    exit /b 0
)
