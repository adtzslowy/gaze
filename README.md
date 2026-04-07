![gaze-image](.github/gaze.png)

![Build Status](https://img.shields.io/github/actions/workflow/status/adtzslowy/gaze/build.yml?style=flat-square\&logo=github\&label=Build)
![TypeScript](https://img.shields.io/badge/TypeScript-%23007ACC.svg?style=flat-square\&logo=typescript\&logoColor=white)

---

Gaze is a lightweight and efficient gaze tracking / monitoring project built with TypeScript.
It focuses on simplicity, performance, and clean architecture, making it suitable for experimentation and real-time applications.

The project is designed to be easy to understand and extend, while still providing a solid base for developing tracking or monitoring systems.

---

## Package used on Gaze

### Node.js

Node.js is used as the runtime environment to execute the application. It provides an event-driven architecture suitable for real-time systems.

website: https://nodejs.org/

---

### TypeScript

TypeScript is a strongly typed superset of JavaScript that improves developer experience and code reliability.

website: https://www.typescriptlang.org/

---

## Installation

```
git clone https://github.com/adtzslowy/gaze.git
cd gaze
npm install
```

---

## Running Gaze

```
npm run dev
```

---

## Build

```
npm run build
```

---

## Project Structure

```
src/        source code  
assets/     static files (images, etc)  
```

---

## Development Notes

* Keep the code simple and readable
* Avoid unnecessary dependencies
* Focus on performance and clarity

---

## Testing

Currently, testing can be done manually by running the development server:

```
npm run dev
```

(automated testing can be added in future releases)

---

## Running with Node

After building:

```
npm run build
node dist/index.js
```

---

## Contributing

Gaze is open for contributions.

Before contributing, please:

* Fork the repository
* Create a new branch
* Follow the existing code style

Then submit a pull request.

---

## License

This project is licensed under the MIT License.
