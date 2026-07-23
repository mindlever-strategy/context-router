#!/bin/bash
# Publish context-router Python SDK to PyPI

set -e

echo "=== Context Router Python SDK Publisher ==="
echo ""

# Check prerequisites
if ! command -v python &> /dev/null; then
    echo "❌ Python not found. Please install Python 3.10+"
    exit 1
fi

# Check for PyPI credentials
if [ ! -f ~/.pypirc ]; then
    echo "⚠️  No ~/.pypirc found. Copy .pypirc.template and configure your credentials."
    echo ""
fi

cd "$(dirname "$0")/.."

# Build the package
echo "📦 Building Python SDK..."
cd packages/sdk-python

# Install build dependencies if needed
pip install --quiet build twine 2>/dev/null || pip install build twine

# Clean previous builds
rm -rf dist/ build/ *.egg-info/

# Build
echo "Building package..."
python -m build

echo ""
echo "📁 Package contents:"
ls -la dist/

echo ""
echo "=== Ready to publish ==="
echo ""
echo "To publish to TestPyPI (recommended for first-time):"
echo "  python -m twine upload --repository testpypi dist/*"
echo ""
echo "To publish to PyPI (production):"
echo "  python -m twine upload dist/*"
echo ""
echo "Or run this script with --publish flag:"
echo "  ./scripts/publish-python.sh --publish"
