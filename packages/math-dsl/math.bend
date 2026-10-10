import Base

# Initial math operation; further DSL syntax can be added in later versions.
def square(+x: U32) -> U32:
  (x * x : U32)
