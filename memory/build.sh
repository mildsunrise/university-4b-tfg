#!/bin/bash
set -e
cd "$(dirname $0)"
PATH="$PATH:$(pwd)/plugins"

inkscape -C img/sota/IO_stack_of_the_Linux_kernel_simplified.svg -o img/sota/IO_stack_of_the_Linux_kernel_simplified.pdf
pandoc --filter=pandoc-minted -f markdown+smart+footnotes+header_attributes -t latex -i sota.md -o sota.tex
