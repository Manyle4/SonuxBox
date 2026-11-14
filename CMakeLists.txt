cmake_minimum_required(VERSION 3.16)
project(sonuxbox LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

option(SONUX_TOOLS "Build the prototype and debug tools in tools/" ON)

find_package(OpenCV REQUIRED)
find_package(Threads REQUIRED)

# The engine only needs these; linking all of OpenCV makes startup crawl.
set(ENGINE_CV_LIBS opencv_core opencv_imgproc opencv_imgcodecs)

# ---- The engine: web API and command-line tool ----
add_executable(api_server src/api_server.cpp)
target_include_directories(api_server PRIVATE third_party/httplib ${OpenCV_INCLUDE_DIRS})
target_link_libraries(api_server PRIVATE Threads::Threads ${ENGINE_CV_LIBS})

add_executable(earth_story src/earth_story.cpp)
target_include_directories(earth_story PRIVATE ${OpenCV_INCLUDE_DIRS})
target_link_libraries(earth_story PRIVATE ${ENGINE_CV_LIBS})

# ---- Earlier prototypes and debug views (not needed to run SonuxBox) ----
if(SONUX_TOOLS)
  set(P tools/prototypes)
  foreach(tool img2sound:main image_to_wav image_story color_debug cluster_debug adaptive_debug)
    string(REPLACE ":" ";" parts ${tool})
    list(GET parts 0 name)
    list(LENGTH parts n)
    if(n EQUAL 2)
      list(GET parts 1 file)
    else()
      set(file ${name})
    endif()
    add_executable(${name} ${P}/${file}.cpp)
    target_include_directories(${name} PRIVATE src ${OpenCV_INCLUDE_DIRS})
    target_link_libraries(${name} PRIVATE ${OpenCV_LIBS})
  endforeach()

  add_executable(melody_test ${P}/melody_test.cpp)
  target_include_directories(melody_test PRIVATE src)

  add_executable(tone_test ${P}/tone_test.cpp)
  target_include_directories(tone_test PRIVATE third_party/miniaudio)
  target_link_libraries(tone_test PRIVATE Threads::Threads ${CMAKE_DL_LIBS} m)
endif()
