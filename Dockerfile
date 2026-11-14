FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ cmake make libopencv-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY CMakeLists.txt .
COPY src src
COPY third_party third_party

# Only the server is needed here, not the debug tools.
RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build --target api_server -j"$(nproc)"

EXPOSE 8080
CMD ["./build/api_server"]
