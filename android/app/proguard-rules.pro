# Zen & Brave Proguard Rules
-keep class tn.myapps.zenbrave.model.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
