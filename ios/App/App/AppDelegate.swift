import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // WebViewの横スクロールを無効化
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.disableWebViewHorizontalScroll()
        }
        return true
    }

    // APNs デバイストークン取得成功
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    // APNs デバイストークン取得失敗
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // WebViewの横スクロール無効化
    private func disableWebViewHorizontalScroll() {
        guard let rootVC = self.window?.rootViewController else { return }
        self.findAndDisableScroll(in: rootVC.view)
    }

    private func findAndDisableScroll(in view: UIView) {
        for subview in view.subviews {
            if let scrollView = subview as? UIScrollView {
                scrollView.showsHorizontalScrollIndicator = false
                scrollView.alwaysBounceHorizontal = false
                scrollView.bounces = false
            }
            findAndDisableScroll(in: subview)
        }
    }
}
