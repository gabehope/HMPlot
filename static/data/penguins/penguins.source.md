# Palmer penguins

Source: the palmerpenguins R package, `inst/extdata/penguins.csv`
(https://github.com/allisonhorst/palmerpenguins, accessed 2026-09-28): 344 penguins of three
species (Adelie, Chinstrap, Gentoo) on three islands of the Palmer Archipelago, Antarctica,
2007 to 2009. Data collected by Dr. Kristen Gorman and the Palmer Station Long Term Ecological
Research Program. License: CC0 1.0 (public domain dedication), in accordance with the Palmer
Station LTER Data Policy. Cite as:

    Horst AM, Hill AP, Gorman KB (2020). palmerpenguins: Palmer Archipelago (Antarctica) penguin
    data. R package version 0.1.0. doi:10.5281/zenodo.3960218

`penguins.csv` is that file with its `NA` cells left empty, so a CSV reader reads them as
missing values. Columns: species, island, bill_length_mm, bill_depth_mm, flipper_length_mm,
body_mass_g, sex, year.
