# university-4b-tfg

My degree thesis:

**[Analysis and mitigation of writeback cache lock-ups in Linux](http://hdl.handle.net/2117/329616)**

This is code for uni, not an actual open-source project.  
Don't expect fantastic code quality or documentation.

Structure:

- `documents`: Internal deliverables. boring stuff
- `memory`: LaTeX project for the thesis memory
- `monitor`: Lil' web application to plot main page cache stats (dirty pages) in real time
- `analysis`: Code to run stress experiments on a kernel + Jupyter notebook for post analysis
- `exp`: Empty folder where I store experiments
- `daemon`: Node.js daemon (presented in the final phase of the work) that watches for offender processes, and lowers their I/O class
- `misc`: Random code (there's just a patch to fix tracecmd Python bindings, I think)
