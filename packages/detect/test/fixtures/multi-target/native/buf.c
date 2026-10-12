#include <stdlib.h>
#include <string.h>

int main(void) {
    char buf[8];
    int *p = NULL;
    strcpy(buf, "this string is far too long");
    char *leak = malloc(64);
    buf[10] = 'x';
    return *p;
}
