// TWA 디지털 에셋 링크 (전체화면 인증). dotfile은 정적업로드 제외되므로 Function으로 서빙.
export const onRequestGet = () => new Response(JSON.stringify([{
  relation: ["delegate_permission/common.handle_all_urls"],
  target: {
    namespace: "android_app",
    package_name: "com.kjeb.app",
    sha256_cert_fingerprints: [
      "BE:CD:92:B5:43:26:7E:35:6A:83:52:7F:CF:03:BA:8F:6D:F4:22:33:08:21:7D:63:C9:1B:76:DE:B4:F6:19:49",
      "88:1B:CF:18:C6:59:CA:39:9C:84:D0:19:77:0E:86:95:91:F2:00:12:AC:F7:E1:33:ED:B4:E1:72:D8:3D:5F:B9"
    ]
  }
}]), { headers: { "content-type": "application/json; charset=utf-8" } });

