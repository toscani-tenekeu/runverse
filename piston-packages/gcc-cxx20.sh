# Compile C++ as C++20 (concepts, ranges, <=>) and C as C17 on the installed GCC.
source /build/lib.sh
for compile in "$PKG_ROOT"/gcc/*/compile; do
  sed -i 's/g++ -std=c++17/g++ -std=c++20/; s/gcc -std=c11/gcc -std=c17/' "$compile"
done
