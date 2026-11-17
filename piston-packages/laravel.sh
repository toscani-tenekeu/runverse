# Laravel on a static PHP 8.4 build (it has mbstring, openssl, pdo_sqlite and the other
# extensions Laravel needs). The project skeleton and its vendor folder live in the package;
# a request copies the small skeleton files next to the user's files and links vendor.
source /build/lib.sh
work=/tmp/laravel
rm -rf "$work" && mkdir -p "$work/bin"
php_file=$(curl -fsSL https://dl.static-php.dev/static-php-cli/common/ | grep -o 'php-8\.4\.[0-9]*-cli-linux-x86_64\.tar\.gz' | sort -uV | tail -1)
curl -fsSL "https://dl.static-php.dev/static-php-cli/common/$php_file" | tar -xz -C "$work/bin"
chmod +x "$work/bin/php"
# The download is UPX-packed. Unpacking at start writes the whole binary, which Piston's
# 10 MB file size limit kills, so it is unpacked once here.
upx_url=$(curl -fsSL https://api.github.com/repos/upx/upx/releases/latest | grep -o 'https://[^"]*upx-[0-9.]*-amd64_linux\.tar\.xz' | head -1)
curl -fsSL "$upx_url" | tar -xJ -C /tmp --strip-components=1 --wildcards '*/upx'
/tmp/upx -d -q "$work/bin/php" >/dev/null
curl -fsSL https://getcomposer.org/download/latest-stable/composer.phar -o /tmp/composer.phar
export COMPOSER_ALLOW_SUPERUSER=1 COMPOSER_NO_INTERACTION=1
"$work/bin/php" /tmp/composer.phar create-project --quiet --no-dev --prefer-dist laravel/laravel "$work/skeleton"
cd "$work/skeleton"
# Each request starts fresh, so state that must survive between requests lives in cookies.
sed -i \
  -e 's/^APP_DEBUG=.*/APP_DEBUG=true/' \
  -e 's/^APP_URL=.*/APP_URL=http:\/\/localhost/' \
  -e 's/^SESSION_DRIVER=.*/SESSION_DRIVER=cookie/' \
  -e 's/^CACHE_STORE=.*/CACHE_STORE=array/' \
  -e 's/^QUEUE_CONNECTION=.*/QUEUE_CONNECTION=sync/' \
  -e 's/^LOG_CHANNEL=.*/LOG_CHANNEL=stderr/' \
  -e 's/^LOG_STACK=.*/LOG_STACK=stderr/' \
  .env
rm -rf node_modules tests .git storage/logs/*.log AGENTS.md CLAUDE.md
V=$("$work/bin/php" -r 'echo json_decode(file_get_contents("vendor/composer/installed.json"), true)["packages"][array_search("laravel/framework", array_column(json_decode(file_get_contents("vendor/composer/installed.json"), true)["packages"], "name"))]["version"];' | sed 's/^v//')
cd /
D=$PKG_ROOT/laravel/$V
rm -rf "$D" && mkdir -p "$(dirname "$D")" && mv "$work" "$D"
cat > "$D/pkg-info.json" <<JSON
{ "language": "laravel", "version": "$V", "provides": [{ "language": "laravel", "aliases": [] }], "build_platform": "runverse" }
JSON
cat > "$D/environment" <<'ENV'
export PATH=$PWD/bin:$PATH
export RV_PKG=$PWD
ENV
# skeleton.tar holds the skeleton without vendor, plus a vendor folder whose packages are links
# into the package and whose composer/ autoloader is a real copy. Composer then resolves App\
# to the user's app/ folder, not the skeleton's.
links=/tmp/laravel-vendor
rm -rf "$links" && mkdir -p "$links/vendor"
cp -a "$D/skeleton/vendor/composer" "$D/skeleton/vendor/autoload.php" "$links/vendor/"
for entry in "$D"/skeleton/vendor/*; do
  name=$(basename "$entry")
  case "$name" in composer | autoload.php) ;; *) ln -s "$entry" "$links/vendor/$name" ;; esac
done
tar -cf "$D/skeleton.tar" -C "$D/skeleton" --exclude=./vendor . -C "$links" vendor
rm -rf "$links"
cat > "$D/prepare.sh" <<'SH'
# Lays the Laravel skeleton under the user's files: their files win.
tar -xf "$RV_PKG/skeleton.tar" --skip-old-files 2>/dev/null || true
SH
cat > "$D/run" <<'SH'
#!/usr/bin/env bash
source "$RV_PKG/prepare.sh"
case "$1" in *.sh) exec bash "$@" ;; esac
exec php "$@"
SH
finish "$D"
keep_only laravel "$V"
echo "✓ laravel $V"
