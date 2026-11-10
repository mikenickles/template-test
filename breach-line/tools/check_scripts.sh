#!/usr/bin/env bash
# Fast compile check of every script (runs only the script-loading test).
cd "$(dirname "$0")/.."
exec tools/run_tests.sh test_scripts
