const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const fontDir = path.join(__dirname, "..", "assets", "fonts");
const fontConfigDir = path.join(os.tmpdir(), "pixel-stl-fontconfig");
const fontCacheDir = path.join(fontConfigDir, "cache");
const fontConfigFile = path.join(fontConfigDir, "fonts.conf");

function writeFontConfig() {
  fs.mkdirSync(fontCacheDir, { recursive: true });
  const xml = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontDir.replace(/\\/g, "/")}</dir>
  <cachedir>${fontCacheDir.replace(/\\/g, "/")}</cachedir>
  <match target="pattern">
    <test name="family" qual="any">
      <string>Noto Sans CJK SC</string>
    </test>
    <edit name="family" mode="prepend" binding="strong">
      <string>Noto Sans SC</string>
    </edit>
  </match>
  <match target="pattern">
    <test name="family" qual="any">
      <string>Microsoft YaHei</string>
    </test>
    <edit name="family" mode="prepend" binding="strong">
      <string>Noto Sans SC</string>
    </edit>
  </match>
</fontconfig>
`;
  fs.writeFileSync(fontConfigFile, xml, "utf8");
}

function configureBundledFonts() {
  writeFontConfig();
  if (!process.env.FONTCONFIG_FILE) {
    process.env.FONTCONFIG_FILE = fontConfigFile;
  }
  process.env.FONTCONFIG_PATH = fontConfigDir;
  if (!process.env.PANGOCAIRO_BACKEND) {
    process.env.PANGOCAIRO_BACKEND = "fontconfig";
  }
}

configureBundledFonts();

module.exports = {
  configureBundledFonts,
  fontConfigFile,
  fontConfigDir,
  fontDir,
};
