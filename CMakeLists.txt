cmake_minimum_required(VERSION 3.16)
project(img2sound LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

find_package(OpenCV REQUIRED)
find_package(Threads REQUIRED)

add_executable(img2sound src/main.cpp)
target_include_directories(img2sound PRIVATE ${OpenCV_INCLUDE_DIRS})
target_link_libraries(img2sound PRIVATE ${OpenCV_LIBS})

add_executable(tone_test src/tone_test.cpp)
target_include_directories(tone_test PRIVATE third_party/miniaudio)
target_link_libraries(tone_test PRIVATE Threads::Threads ${CMAKE_DL_LIBS} m)

add_executable(melody_test src/melody_test.cpp)

add_executable(image_to_wav src/image_to_wav.cpp)
target_include_directories(image_to_wav PRIVATE ${OpenCV_INCLUDE_DIRS})
target_link_libraries(image_to_wav PRIVATE ${OpenCV_LIBS})

add_executable(image_story src/image_story.cpp)
target_include_directories(image_story PRIVATE ${OpenCV_INCLUDE_DIRS})
target_link_libraries(image_story PRIVATE ${OpenCV_LIBS})

add_executable(color_debug src/color_debug.cpp)
target_include_directories(color_debug PRIVATE ${OpenCV_INCLUDE_DIRS})
target_link_libraries(color_debug PRIVATE ${OpenCV_LIBS})

add_executable(earth_story src/earth_story.cpp)
target_include_directories(earth_story PRIVATE ${OpenCV_INCLUDE_DIRS})
target_link_libraries(earth_story PRIVATE ${OpenCV_LIBS})

add_executable(api_server src/api_server.cpp)
target_include_directories(api_server PRIVATE third_party/httplib ${OpenCV_INCLUDE_DIRS})
target_link_libraries(api_server PRIVATE Threads::Threads ${OpenCV_LIBS})

add_executable(cluster_debug src/cluster_debug.cpp)
target_include_directories(cluster_debug PRIVATE ${OpenCV_INCLUDE_DIRS})
target_link_libraries(cluster_debug PRIVATE ${OpenCV_LIBS})

add_executable(adaptive_debug src/adaptive_debug.cpp)
target_include_directories(adaptive_debug PRIVATE ${OpenCV_INCLUDE_DIRS})
target_link_libraries(adaptive_debug PRIVATE ${OpenCV_LIBS})