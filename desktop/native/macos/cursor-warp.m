#import <ApplicationServices/ApplicationServices.h>
#import <Foundation/Foundation.h>

static BOOL moveCursor(const char *xText, const char *yText) {
  char *xEnd = NULL;
  char *yEnd = NULL;
  double x = strtod(xText, &xEnd);
  double y = strtod(yText, &yEnd);
  if (xEnd == xText || yEnd == yText) return NO;
  CGError result = CGWarpMouseCursorPosition(CGPointMake(x, y));
  CGAssociateMouseAndMouseCursorPosition(true);
  return result == kCGErrorSuccess;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc >= 3) return moveCursor(argv[1], argv[2]) ? 0 : 1;

    char line[256];
    while (fgets(line, sizeof(line), stdin) != NULL) {
      char xText[64];
      char yText[64];
      if (sscanf(line, "%63s %63s", xText, yText) == 2) {
        moveCursor(xText, yText);
      }
    }
  }
  return 0;
}
