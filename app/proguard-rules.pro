# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.fontaine.wardrobe.**$$serializer { *; }
-keepclassmembers class com.fontaine.wardrobe.** { *** Companion; }
-keepclasseswithmembers class com.fontaine.wardrobe.** { kotlinx.serialization.KSerializer serializer(...); }
