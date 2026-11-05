cask "kokpit" do
  version "@VERSION@"
  sha256 "@SHA@"

  url "https://github.com/@REPO@/releases/download/v#{version}/Kokpit-#{version}-arm64.dmg"
  name "Kokpit"
  desc "Desktop app for everything you do with Claude Code"
  homepage "https://github.com/@REPO@"

  depends_on arch: :arm64

  app "Kokpit.app"

  postflight do
    system_command "/usr/bin/xattr", args: ["-cr", "#{appdir}/Kokpit.app"]
  end

  zap trash: [
    "~/Library/Application Support/Kokpit",
  ]
end
