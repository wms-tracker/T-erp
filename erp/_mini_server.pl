#!/usr/bin/perl
# Minimal static file HTTP server (no dependencies beyond core Perl)
# Serves files from the project root directory on http://localhost:PORT/
use strict;
use warnings;
use IO::Socket::INET;

my $PORT = 8080;
my $ROOT = $ARGV[0] // '.';

my %MIME = (
  html => 'text/html; charset=utf-8',
  htm  => 'text/html; charset=utf-8',
  js   => 'application/javascript; charset=utf-8',
  mjs  => 'application/javascript; charset=utf-8',
  css  => 'text/css; charset=utf-8',
  json => 'application/json; charset=utf-8',
  png  => 'image/png',
  jpg  => 'image/jpeg',
  jpeg => 'image/jpeg',
  gif  => 'image/gif',
  svg  => 'image/svg+xml',
  ico  => 'image/x-icon',
  txt  => 'text/plain; charset=utf-8',
  md   => 'text/plain; charset=utf-8',
);

my $server = IO::Socket::INET->new(
  LocalHost => '0.0.0.0',
  LocalPort => $PORT,
  Proto     => 'tcp',
  Listen    => 64,
  Reuse     => 1,
) or die "Cannot start server on port $PORT: $!\n";

print "Serving '$ROOT' at http://0.0.0.0:$PORT/  (Ctrl+C to stop)\n";

while (my $client = $server->accept()) {
  my $request_line = <$client>;
  next unless defined $request_line;
  # consume remaining headers
  while (my $line = <$client>) { last if $line =~ /^\r?\n$/; }

  if ($request_line =~ m{^GET\s+([^\s?]+)}) {
    my $path = $1;
    $path =~ s/%([0-9A-Fa-f]{2})/chr(hex($1))/ge; # url-decode
    $path = '/index.html' if $path eq '/';
    $path =~ s{\.\.}{}g; # very basic traversal guard

    my $file = $ROOT . $path;
    if (-d $file) { $file .= '/index.html'; }

    if (-f $file) {
      open(my $fh, '<:raw', $file) or do { send_error($client, 500, 'Read error'); next; };
      local $/;
      my $content = <$fh>;
      close $fh;
      my ($ext) = $file =~ /\.([^.\/]+)$/;
      my $ctype = $MIME{lc($ext // '')} // 'application/octet-stream';
      print $client "HTTP/1.1 200 OK\r\n";
      print $client "Content-Type: $ctype\r\n";
      print $client "Content-Length: " . length($content) . "\r\n";
      print $client "Cache-Control: no-cache\r\n";
      print $client "Connection: close\r\n\r\n";
      print $client $content;
    } else {
      send_error($client, 404, 'Not Found: ' . $path);
    }
  } else {
    send_error($client, 400, 'Bad Request');
  }
  close $client;
}

sub send_error {
  my ($client, $code, $msg) = @_;
  my $body = "<h1>$code</h1><p>$msg</p>";
  print $client "HTTP/1.1 $code $msg\r\n";
  print $client "Content-Type: text/html; charset=utf-8\r\n";
  print $client "Content-Length: " . length($body) . "\r\n";
  print $client "Connection: close\r\n\r\n";
  print $client $body;
}
