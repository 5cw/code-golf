#include <stdio.h>
#include <unistd.h>

int main (int argc, char *argv[]) {
    char buffer[4096];
    ssize_t nbytes;
    FILE *fp = fopen("/tmp/code.ijs", "w");

    if (fp == 0)
        return 1;

    while ((nbytes = fread(buffer, sizeof(char), sizeof(buffer), stdin)) > 0)
        if (fwrite(buffer, sizeof(char), nbytes, fp) != nbytes)
            return 2;

    fclose(fp);

    execv("/usr/bin/jconsole", argv);
    perror("execv");
}
