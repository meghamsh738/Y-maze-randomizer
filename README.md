# Y-maze Randomizer

Y-maze Randomizer is an early-stage Python project that aims to generate randomized sequences of left and right turns for Y-maze behavioral experiments.

## Example

The snippet below demonstrates generating a random sequence in pure Python.

```python
import random

def random_sequence(length: int) -> str:
    return ''.join(random.choice("LR") for _ in range(length))

if __name__ == "__main__":
    print(random_sequence(10))
```

Running the script prints a string such as `LRRLLRLRRL`.

## Contributing

This repository currently contains documentation only. To contribute code or proposed features:

1. Fork the repository.
2. Create a descriptive feature branch.
3. Commit your changes with clear messages.
4. Open a pull request for review.

## Project status

The project is in its initial stages and welcomes community input on desired features and design.

